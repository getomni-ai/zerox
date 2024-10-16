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


async def find_substring_indices_from_ocr_data(
    content_list: List[str], substring: str, substring_start_index: int
) -> Tuple[int, int]:
    """
    Find the indices of the first and last strings in a list
    of strings that contain a specified substring starting from a given index.

    Args:
        content_list (List[str]): A list of strings to search through.
        substring (str): The substring to find within the content list.
        substring_start_index (int): The starting index in the combined string
                                      representation of the content list from
                                      which to search for the substring.

    Returns:
        Tuple[int, int]: A tuple containing the index of the first string
                         and the index of the last string that contains
                         the substring. Returns (-1, -1) if the substring
                         is not found within the specified range.
    """
    substring_length = len(substring)
    current_length: int = 0
    first_string_index: int = -1
    last_string_index: int = -1

    for index, string in enumerate(content_list):
        string_length = len(string) + 1
        if current_length <= substring_start_index + 1 < current_length + string_length:
            first_string_index = index
        if (
            current_length
            <= substring_start_index + substring_length - 1
            < current_length + string_length
        ):
            last_string_index = index
        current_length += string_length

    return first_string_index, last_string_index


async def calculate_bounding_box(
    ocr_data: Dict[str, list], first_string_index: int, last_string_index: int
) -> Tuple[float, float, float, float]:
    """
    Calculate the bounding box coordinates that encompasses a set of strings based on OCR data.

    Args:
        ocr_data (Dict[str, list]): A dictionary containing lists of
            'left_list', 'top_list', 'width_list', and 'height_list'
            representing the OCR data for the strings.
        first_string_index (int): The index of the first string to consider.
        last_string_index (int): The index of the last string to consider.

    Returns:
        Tuple[float, float, float, float]: A tuple containing the coordinates
            of the bounding box in the format (left, top, width, height).
    """
    leftmost_string_x = ocr_data["left_list"][first_string_index]
    rightmost_string_x = 0
    topmost_string_y = ocr_data["top_list"][first_string_index]
    bottommost_string_y = 0
    rightmost_string_width = ocr_data["width_list"][first_string_index]
    bottommost_string_height = ocr_data["height_list"][first_string_index]

    for i in range(first_string_index + 1, last_string_index + 1):
        if ocr_data["left_list"][i] < leftmost_string_x:
            leftmost_string_x = ocr_data["left_list"][i]
        if ocr_data["top_list"][i] < topmost_string_y:
            topmost_string_y = ocr_data["top_list"][i]
        if ocr_data["left_list"][i] > rightmost_string_x:
            rightmost_string_x = ocr_data["left_list"][i]
            rightmost_string_width = ocr_data["width_list"][i]
        if ocr_data["top_list"][i] > bottommost_string_y:
            bottommost_string_y = ocr_data["top_list"][i]
            bottommost_string_height = ocr_data["height_list"][i]

    width = 0
    height = 0
    if rightmost_string_x > leftmost_string_x:
        width = rightmost_string_x - leftmost_string_x
    if bottommost_string_y > topmost_string_y:
        height = bottommost_string_y - topmost_string_y
    max_width = width + rightmost_string_width
    max_height = height + bottommost_string_height

    return leftmost_string_x, topmost_string_y, max_width, max_height


async def normalize_bounding_box(
    left: float,
    top: float,
    width: float,
    height: float,
    image_dimensions: Tuple[float, float],
) -> Tuple[float, float, float, float]:
    """
    Normalize the bounding box coordinates and dimensions based on the image dimensions.

    Args:
        left (float): The x-coordinate of the top-left corner of the bounding box.
        top (float): The y-coordinate of the top-left corner of the bounding box.
        width (float): The width of the bounding box.
        height (float): The height of the bounding box.
        image_dimensions (Tuple[float, float]): A tuple containing the width and height of the image.

    Returns:
        Tuple[float, float, float, float]: A tuple containing the normalized left, top, width, and height of the bounding box.
    """
    normalized_left = left / image_dimensions[0]
    normalized_top = top / image_dimensions[1]
    normalized_width = width / image_dimensions[0]
    normalized_height = height / image_dimensions[1]

    return normalized_left, normalized_top, normalized_width, normalized_height


async def find_bounding_box(
    ocr_data: Dict[str, list], string_to_compare: str
) -> Tuple[float, float, float, float]:
    """
    Find the bounding box coordinates for a given string within the OCR data.

    Args:
        ocr_data (Dict[str, list]): A dictionary containing OCR data.
        string_to_compare (str): The string for which the bounding box needs to be found.

    Returns:
        Tuple[float, float, float, float]: A tuple containing the bounding box coordinates in the format (left, top, width, height).
    """
    try:
        text_content = " ".join(ocr_data["text_list"])
        substring, substring_start_index = (
            await find_substring_with_minimum_edit_distance(
                content_string=text_content, pattern=string_to_compare
            )
        )
        first_string_index, last_string_index = (
            await find_substring_indices_from_ocr_data(
                content_list=ocr_data["text_list"],
                substring=substring,
                substring_start_index=substring_start_index,
            )
        )
        left, top, width, height = await calculate_bounding_box(
            ocr_data=ocr_data,
            first_string_index=first_string_index,
            last_string_index=last_string_index,
        )
        left, top, width, height = await normalize_bounding_box(
            left=left,
            top=top,
            width=width,
            height=height,
            image_dimensions=ocr_data["dimensions"],
        )
        return left, top, width, height
    except Exception as err:
        raise Exception(Messages.FAILED_TO_FIND_BOUNDING_BOX.format(err))
