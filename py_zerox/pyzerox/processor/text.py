import re
from bs4 import BeautifulSoup
import markdown

# Package imports
from ..constants.patterns import Patterns


def format_markdown(text: str) -> str:
    """Format markdown text by removing markdown and code blocks"""

    formatted_markdown = re.sub(Patterns.MATCH_MARKDOWN_BLOCKS, r"\1", text)
    formatted_markdown = re.sub(Patterns.MATCH_CODE_BLOCKS, r"\1", formatted_markdown)
    return formatted_markdown


def remove_markdown(content: str) -> str:
    """
    Converts a Markdown formatted string to plain text.

    Args:
        content (str): A string containing Markdown formatted text.

    Returns:
        str: A plain text representation of the input Markdown content.
    """
    html = markdown.markdown(content)

    parsed_html = BeautifulSoup(html, "html.parser")
    content_text = parsed_html.get_text()

    content_text = re.sub(r"-+", "", content_text)
    content_text = re.sub(r"\|", "", content_text)
    content_text = re.sub(r"\n+", "\n", content_text)
    content_text = re.sub(r"\s+", " ", content_text)
    content_text = content_text.strip()

    return content_text
