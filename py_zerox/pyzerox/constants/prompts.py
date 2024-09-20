class Prompts:
    """Class for storing prompts for the Zerox system."""

    DEFAULT_SYSTEM_PROMPT = """
    Convert the following PDF page to markdown.
    Return only the markdown with no explanation text.
    Do not exclude any content from the page.
    """

    BOUNDING_BOX_SYSTEM_PROMPT = """
    For each section (eg: headings, tables, footers, etc.), add a comment "section" at the end of that section in markdown.
    Ensure as much content as possible is formatted using markdown where applicable.
    """
