# pre_install.py

import subprocess
import sys
import platform


def run_command(command):
    try:
        result = subprocess.run(command, shell=True, text=True, capture_output=True)
        result.check_returncode()
        return result.stdout
    except subprocess.CalledProcessError as e:
        raise RuntimeError(e.stderr.strip())


def install_package(command, package_name):
    try:
        output = run_command(command)
        print(output)
        return output
    except RuntimeError as e:
        raise RuntimeError(f"Failed to install {package_name}: {e}")


def check_and_install_poppler():
    """Check for the installation of Poppler and install if not present."""

    try:
        run_command("pdftoppm -h")
    except RuntimeError:
        if platform.system() == "Darwin":  # macOS
            install_package("brew install poppler", "Poppler")
        elif platform.system() == "Linux":  # Linux
            install_package(
                "sudo apt-get update && sudo apt-get install -y poppler-utils",
                "Poppler",
            )
        else:
            raise RuntimeError(
                "Please install Poppler manually from https://poppler.freedesktop.org/"
            )


def check_and_install_tesseract():
    """Check for the installation of Tesseract and install if not present."""
    try:
        run_command("tesseract --version")
    except RuntimeError:
        if platform.system() == "Darwin":  # macOS
            install_package("brew install tesseract", "Tesseract")
        elif platform.system() == "Linux":  # Linux
            install_package(
                "sudo apt-get update && sudo apt-get install -y tesseract-ocr",
                "Tesseract",
            )
        elif platform.system() == "Windows":  # Windows
            print(
                "Please download and install Tesseract from the official GitHub repository: https://github.com/UB-Mannheim/tesseract/wiki"
            )
            print(
                "Make sure to add the Tesseract installation path to your system's PATH environment variable."
            )
        else:
            raise RuntimeError(
                "Please install Tesseract manually from the official website."
            )


def check_and_install():
    try:
        check_and_install_poppler()
        check_and_install_tesseract()

    except RuntimeError as err:
        print(f"Error during installation: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    check_and_install()
