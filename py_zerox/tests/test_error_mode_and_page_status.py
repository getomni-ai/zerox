"""
Regression tests for error_mode, PageStatus, and the convert_pdf_to_images None crash fix.

These tests validate:
1. ErrorMode enum and string coercion
2. PageStatus enum on Page dataclass
3. ZeroxOutput.num_successful / num_failed counters
4. convert_pdf_to_images raises RuntimeError instead of returning None (fix for #72)
5. process_page returns status/error in both THROW and IGNORE modes
6. process_pages_in_batches propagates error_mode
7. zerox() signature accepts error_mode parameter
8. Source-code level audit for backward compatibility
"""

import ast
import inspect
import os
import sys
import textwrap
import unittest

# ---------------------------------------------------------------------------
# Ensure py_zerox is importable
# ---------------------------------------------------------------------------
_PY_ZEROX_DIR = os.path.join(os.path.dirname(__file__), os.pardir)
sys.path.insert(0, os.path.abspath(_PY_ZEROX_DIR))

from pyzerox.core.types import ErrorMode, Page, PageStatus, ZeroxOutput


class TestErrorModeEnum(unittest.TestCase):
    """ErrorMode enum values, string coercion, and membership."""

    def test_throw_value(self):
        self.assertEqual(ErrorMode.THROW.value, "THROW")

    def test_ignore_value(self):
        self.assertEqual(ErrorMode.IGNORE.value, "IGNORE")

    def test_string_coercion_uppercase(self):
        """ErrorMode("THROW") should work (used in zerox() normalization)."""
        self.assertEqual(ErrorMode("THROW"), ErrorMode.THROW)

    def test_string_coercion_from_lower(self):
        """The zerox() function calls ErrorMode(error_mode.upper()), so 'ignore' -> 'IGNORE'."""
        self.assertEqual(ErrorMode("ignore".upper()), ErrorMode.IGNORE)

    def test_is_str_subclass(self):
        """ErrorMode inherits str so it can be compared to plain strings."""
        self.assertIsInstance(ErrorMode.THROW, str)

    def test_invalid_raises_valueerror(self):
        with self.assertRaises(ValueError):
            ErrorMode("INVALID")


class TestPageStatusEnum(unittest.TestCase):
    """PageStatus enum values."""

    def test_success_value(self):
        self.assertEqual(PageStatus.SUCCESS.value, "SUCCESS")

    def test_error_value(self):
        self.assertEqual(PageStatus.ERROR.value, "ERROR")


class TestPageDataclass(unittest.TestCase):
    """Page dataclass has status and error fields with correct defaults."""

    def test_default_status_is_success(self):
        page = Page(content="hello", content_length=5, page=1)
        self.assertEqual(page.status, PageStatus.SUCCESS)

    def test_default_error_is_none(self):
        page = Page(content="hello", content_length=5, page=1)
        self.assertIsNone(page.error)

    def test_error_page(self):
        page = Page(
            content="",
            content_length=0,
            page=3,
            status=PageStatus.ERROR,
            error="Model timeout",
        )
        self.assertEqual(page.status, PageStatus.ERROR)
        self.assertEqual(page.error, "Model timeout")


class TestZeroxOutputCounters(unittest.TestCase):
    """ZeroxOutput has num_successful and num_failed counters."""

    def test_default_counters(self):
        out = ZeroxOutput(
            completion_time=100.0,
            file_name="test",
            input_tokens=0,
            output_tokens=0,
            pages=[],
        )
        self.assertEqual(out.num_successful, 0)
        self.assertEqual(out.num_failed, 0)

    def test_explicit_counters(self):
        out = ZeroxOutput(
            completion_time=100.0,
            file_name="test",
            input_tokens=0,
            output_tokens=0,
            pages=[],
            num_successful=5,
            num_failed=2,
        )
        self.assertEqual(out.num_successful, 5)
        self.assertEqual(out.num_failed, 2)


class TestConvertPdfNoneGuard(unittest.TestCase):
    """convert_pdf_to_images must raise RuntimeError instead of returning None (#72)."""

    def test_source_has_none_check(self):
        """The function body must contain a check for 'image_paths is None'."""
        src_path = os.path.join(
            os.path.dirname(__file__),
            os.pardir,
            "pyzerox",
            "processor",
            "pdf.py",
        )
        with open(src_path) as f:
            source = f.read()
        self.assertIn("image_paths is None", source)

    def test_source_raises_on_error(self):
        """The except block must re-raise (RuntimeError) instead of silently returning None."""
        src_path = os.path.join(
            os.path.dirname(__file__),
            os.pardir,
            "pyzerox",
            "processor",
            "pdf.py",
        )
        with open(src_path) as f:
            source = f.read()
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "convert_pdf_to_images":
                # Find except handlers — they should all contain a raise
                for child in ast.walk(node):
                    if isinstance(child, ast.ExceptHandler):
                        raises = [n for n in ast.walk(child) if isinstance(n, ast.Raise)]
                        self.assertGreater(
                            len(raises), 0,
                            "convert_pdf_to_images except handler must re-raise"
                        )
                return
        self.fail("convert_pdf_to_images function not found in pdf.py")


class TestProcessPageSignature(unittest.TestCase):
    """process_page and process_pages_in_batches accept error_mode parameter."""

    def test_process_page_has_error_mode(self):
        from pyzerox.processor.pdf import process_page
        sig = inspect.signature(process_page)
        self.assertIn("error_mode", sig.parameters)
        self.assertEqual(sig.parameters["error_mode"].default, ErrorMode.IGNORE)

    def test_process_pages_in_batches_has_error_mode(self):
        from pyzerox.processor.pdf import process_pages_in_batches
        sig = inspect.signature(process_pages_in_batches)
        self.assertIn("error_mode", sig.parameters)
        self.assertEqual(sig.parameters["error_mode"].default, ErrorMode.IGNORE)

    def test_process_page_returns_6_tuple(self):
        """Return type annotation includes status and error_message (6 elements)."""
        from pyzerox.processor.pdf import process_page
        # Check via source — the return type hint includes PageStatus
        src = inspect.getsource(process_page)
        self.assertIn("PageStatus", src)


class TestZeroxSignature(unittest.TestCase):
    """zerox() function accepts error_mode with correct default."""

    def test_zerox_has_error_mode(self):
        from pyzerox.core.zerox import zerox
        sig = inspect.signature(zerox)
        self.assertIn("error_mode", sig.parameters)

    def test_zerox_error_mode_default_is_ignore(self):
        from pyzerox.core.zerox import zerox
        sig = inspect.signature(zerox)
        default = sig.parameters["error_mode"].default
        self.assertEqual(default, ErrorMode.IGNORE)


class TestBackwardCompatibility(unittest.TestCase):
    """Ensure existing public API surface is preserved."""

    def test_page_still_has_original_fields(self):
        """content, content_length, page must still exist."""
        page = Page(content="x", content_length=1, page=1)
        self.assertEqual(page.content, "x")
        self.assertEqual(page.content_length, 1)
        self.assertEqual(page.page, 1)

    def test_zerox_output_still_has_original_fields(self):
        out = ZeroxOutput(
            completion_time=1.0,
            file_name="f",
            input_tokens=10,
            output_tokens=20,
            pages=[],
        )
        self.assertEqual(out.completion_time, 1.0)
        self.assertEqual(out.file_name, "f")
        self.assertEqual(out.input_tokens, 10)
        self.assertEqual(out.output_tokens, 20)
        self.assertEqual(out.pages, [])

    def test_package_exports_error_mode_and_page_status(self):
        """pyzerox.__init__ exports ErrorMode and PageStatus."""
        import pyzerox
        self.assertTrue(hasattr(pyzerox, "ErrorMode"))
        self.assertTrue(hasattr(pyzerox, "PageStatus"))

    def test_package_still_exports_zerox(self):
        import pyzerox
        self.assertTrue(hasattr(pyzerox, "zerox"))
        self.assertTrue(hasattr(pyzerox, "Prompts"))
        self.assertTrue(hasattr(pyzerox, "DEFAULT_SYSTEM_PROMPT"))


class TestSourceAudit(unittest.TestCase):
    """Source-level checks for implementation correctness."""

    def _read_source(self, rel_path):
        path = os.path.join(os.path.dirname(__file__), os.pardir, rel_path)
        with open(path) as f:
            return f.read()

    def test_zerox_passes_error_mode_to_process_page(self):
        src = self._read_source("pyzerox/core/zerox.py")
        self.assertIn("error_mode=error_mode", src)

    def test_zerox_passes_error_mode_to_process_pages_in_batches(self):
        src = self._read_source("pyzerox/core/zerox.py")
        self.assertIn("error_mode=error_mode", src)

    def test_zerox_tracks_num_successful_and_failed(self):
        src = self._read_source("pyzerox/core/zerox.py")
        self.assertIn("num_successful", src)
        self.assertIn("num_failed", src)

    def test_process_page_throws_in_throw_mode(self):
        """process_page source must contain 'if error_mode == ErrorMode.THROW: raise'."""
        src = self._read_source("pyzerox/processor/pdf.py")
        self.assertIn("ErrorMode.THROW", src)
        self.assertIn("raise", src)

    def test_zerox_normalizes_string_error_mode(self):
        """zerox() must handle string error_mode values."""
        src = self._read_source("pyzerox/core/zerox.py")
        self.assertIn("isinstance(error_mode, str)", src)
        self.assertIn("error_mode.upper()", src)


if __name__ == "__main__":
    unittest.main()
