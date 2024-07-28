from setuptools import setup, find_packages
from setuptools.command.install import install
import subprocess
import sys


class InstallSystemDependencies(install):
    def run(self):
        try:
            subprocess.check_call([sys.executable, "-m", "py_zerox.scripts.pre_install"])
        except subprocess.CalledProcessError as e:
            print(f"Pre-install script failed: {e}", file=sys.stderr)
            sys.exit(1)
        install.run(self)


setup(
    cmdclass={
        "install": InstallSystemDependencies,
    },
    packages=find_packages(),
    include_package_data=True,
)
