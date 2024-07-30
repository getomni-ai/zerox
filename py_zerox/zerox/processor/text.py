import re

from ..constants.patterns import Patterns


def format_markdown(text: str) -> str:
    formatted_markdown = re.sub(Patterns.MATCH_MARKDOWN_BLOCKS, r"\1", text)
    formatted_markdown = re.sub(Patterns.MATCH_CODE_BLOCKS, r"\1", formatted_markdown)
    return formatted_markdown
