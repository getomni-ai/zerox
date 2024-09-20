from typing import Dict, List, Tuple

import Levenshtein

from py_zerox.pyzerox.constants.messages import Messages


async def find_substring_with_minimum_edit_distance(
    content_string: str, pattern: str
) -> Tuple[str, int]:
    """
    Find the substring within the given content string
    that has the minimum edit distance to the specified pattern.

    Args:
        content_string (str): The string in which to search for the substring.
        pattern (str): The pattern to compare against.

    Returns:
        Tuple[str, int]: A tuple containing the best matching substring
                         and its starting index in the content string.
                         If no substring is found, the starting index
                         will be -1.
    """
    content_length = len(content_string)
    pattern_length = len(pattern)
    min_distance = float("inf")
    best_substring: str = ""
    best_substring_start_index: int = -1

    for i in range(content_length - pattern_length + 1):
        substring = content_string[i : i + pattern_length]
        distance = Levenshtein.distance(substring, pattern)
        if distance < min_distance:
            min_distance = distance
            best_substring = substring
            best_substring_start_index = i

    return best_substring, best_substring_start_index


