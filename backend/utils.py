import aiofiles
import urllib
import mistune
import os

async def write_to_file(filename: str, text: str) -> None:
    """Asynchronously write text to a file in UTF-8 encoding.

    Args:
        filename (str): The filename to write to.
        text (str): The text to write.
    """
    # Ensure text is a string
    if not isinstance(text, str):
        text = str(text)

    # Convert text to UTF-8, replacing any problematic characters
    text_utf8 = text.encode('utf-8', errors='replace').decode('utf-8')

    async with aiofiles.open(filename, "w", encoding='utf-8') as file:
        await file.write(text_utf8)

async def write_text_to_md(text: str, filename: str = "") -> str:
    """Writes text to a Markdown file and returns the file path.

    Args:
        text (str): Text to write to the Markdown file.

    Returns:
        str: The file path of the generated Markdown file.
    """
    import uuid

    safe_name = (filename or "").strip()[:60] or f"report-{uuid.uuid4().hex[:12]}"
    safe_name = safe_name.replace("/", "-").replace("\\", "-")
    os.makedirs("outputs", exist_ok=True)
    file_path = f"outputs/{safe_name}.md"
    await write_to_file(file_path, text)
    return urllib.parse.quote(file_path)

_PDF_FONT_CACHE = None

# The built-in PDF fonts cannot draw CJK glyphs, so a system font that covers
# them is embedded instead. Plain .ttf files come first because some PDF
# tooling cannot open .ttc collections.
_PDF_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]

# Name the report CSS refers to for the embedded font.
_PDF_FONT_FAMILY = "ReportBodyFont"


def _find_pdf_font() -> str:
    """Path of the first available Unicode-capable system font, or "".

    Returns "" when nothing suitable is installed, in which case the PDF
    backend falls back to its own (Latin-only) default font.
    """
    global _PDF_FONT_CACHE
    if _PDF_FONT_CACHE is None:
        _PDF_FONT_CACHE = next(
            (path for path in _PDF_FONT_CANDIDATES if os.path.exists(path)), ""
        )
    return _PDF_FONT_CACHE


def _pdf_font_css(font_path: str) -> str:
    """CSS that embeds ``font_path`` and makes it the report's body font.

    The override is appended after backend/styles/pdf_styles.css, whose
    "Libre Baskerville" webfont is usually not installed locally.
    """
    selectors = "body, h1, h2, h3, h4, h5, h6, p, li, td, th, div, span, a, strong, em"
    url = font_path.replace("\\", "/")
    return (
        f"@font-face {{ font-family: {_PDF_FONT_FAMILY}; src: url('{url}'); }}\n"
        f"{selectors} {{ font-family: {_PDF_FONT_FAMILY}, serif; }}"
    )


def _resolve_pdf_link(uri: str, base_dir: str) -> str:
    """Map a link/image reference from the report HTML to something the PDF
    backend can read: keep http(s) URLs as-is, resolve everything else to an
    absolute filesystem path (so local images under outputs/ are embedded).
    """
    if uri.startswith(("http://", "https://")):
        return uri

    path = urllib.parse.unquote(uri).replace("\\", "/")
    if path.startswith("file://"):
        return path[len("file://"):]
    if len(path) > 1 and path[1] == ":":  # already absolute, e.g. C:/...
        return path
    return os.path.join(base_dir, path.lstrip("/"))


def _preprocess_images_for_pdf(text: str) -> str:
    """Convert web image URLs to absolute file paths for PDF generation.

    Transforms /outputs/images/... URLs to absolute paths so the PDF backend
    does not have to resolve them against the web app's routes.
    """
    import re
    
    base_path = os.path.abspath(".")
    
    # Pattern to find markdown images with /outputs/ URLs
    def replace_image_url(match):
        alt_text = match.group(1)
        url = match.group(2)
        
        # Convert /outputs/... to absolute path
        if url.startswith("/outputs/"):
            abs_path = os.path.join(base_path, url.lstrip("/"))
            return f"![{alt_text}]({abs_path})"
        return match.group(0)
    
    # Match ![alt text](/outputs/images/...)
    pattern = r'!\[([^\]]*)\]\((/outputs/[^)]+)\)'
    return re.sub(pattern, replace_image_url, text)


async def write_md_to_pdf(text: str, filename: str = "") -> str:
    """Converts Markdown text to a PDF file and returns the file path.

    Uses xhtml2pdf (pure Python) instead of WeasyPrint so PDF export also works
    on Windows, where WeasyPrint's GTK/pango native libraries are usually
    missing and generation silently produced an empty path.

    Args:
        text (str): Markdown text to convert.

    Returns:
        str: The encoded file path of the generated PDF, or "" on failure.
    """
    import uuid

    # Empty / whitespace-only filename previously wrote "outputs/.pdf" which
    # confuses download UIs (#1718). Prefer a stable non-empty basename.
    safe_name = (filename or "").strip()[:60] or f"report-{uuid.uuid4().hex[:12]}"
    # Replace path separators to keep the PDF under outputs/.
    safe_name = safe_name.replace("/", "-").replace("\\", "-")
    os.makedirs("outputs", exist_ok=True)
    file_path = f"outputs/{safe_name}.pdf"

    try:
        from xhtml2pdf import pisa
        from xhtml2pdf.config.resources import ResourceAccessPolicy

        # Resolve css path relative to this backend module to avoid
        # dependency on the current working directory.
        current_dir = os.path.dirname(os.path.abspath(__file__))
        css_path = os.path.join(current_dir, "styles", "pdf_styles.css")
        with open(css_path, "r", encoding="utf-8") as css_file:
            css = css_file.read()

        font_path = _find_pdf_font()
        font_override = _pdf_font_css(font_path) if font_path else ""

        # Preprocess image URLs for PDF compatibility
        processed_text = _preprocess_images_for_pdf(text)
        html = (
            "<html><head><meta charset='utf-8'>"
            f"<style>{css}\n{font_override}</style></head><body>"
            f"{mistune.html(processed_text)}</body></html>"
        )

        base_dir = os.path.abspath(".")

        def resolve_link(uri: str, rel=None) -> str:
            return _resolve_pdf_link(uri, base_dir)

        # The renderer only reads local files under the policy's roots, so the
        # font directory is added alongside the working directory (where the
        # report's own images live).
        policy = ResourceAccessPolicy(
            base_dir=base_dir,
            extra_roots=(os.path.dirname(font_path),) if font_path else (),
        )

        with open(file_path, "wb") as pdf_file:
            status = pisa.CreatePDF(
                html,
                dest=pdf_file,
                link_callback=resolve_link,
                resource_policy=policy,
            )

        if status.err:
            print(f"Error in converting Markdown to PDF: {status.err} rendering error(s)")
            return ""

        print(f"Report written to {file_path}")
    except Exception as e:
        print(f"Error in converting Markdown to PDF: {e}")
        return ""

    encoded_file_path = urllib.parse.quote(file_path)
    return encoded_file_path

async def write_md_to_word(text: str, filename: str = "") -> str:
    """Converts Markdown text to a DOCX file and returns the file path.

    Args:
        text (str): Markdown text to convert.

    Returns:
        str: The encoded file path of the generated DOCX.
    """
    import uuid

    safe_name = (filename or "").strip()[:60] or f"report-{uuid.uuid4().hex[:12]}"
    safe_name = safe_name.replace("/", "-").replace("\\", "-")
    os.makedirs("outputs", exist_ok=True)
    file_path = f"outputs/{safe_name}.docx"

    try:
        from docx import Document
        from htmldocx import HtmlToDocx
        # Convert report markdown to HTML
        html = mistune.html(text)
        # Create a document object
        doc = Document()
        # Convert the html generated from the report to document format
        HtmlToDocx().add_html_to_document(html, doc)

        # Saving the docx document to file_path
        doc.save(file_path)

        print(f"Report written to {file_path}")

        encoded_file_path = urllib.parse.quote(file_path)
        return encoded_file_path

    except Exception as e:
        print(f"Error in converting Markdown to DOCX: {e}")
        return ""