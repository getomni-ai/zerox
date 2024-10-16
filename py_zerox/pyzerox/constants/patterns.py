class Patterns:
    """Regex patterns for markdown and code blocks"""

    MATCH_MARKDOWN_BLOCKS = r"^```[a-z]*\n([\s\S]*?)\n```$"

    MATCH_CODE_BLOCKS = r"^```\n([\s\S]*?)\n```$"


class MarkdownConstants:
    """A class to hold constants related to Markdown formatting."""

    SECTION_DELIMITER = "<!-- section -->"
