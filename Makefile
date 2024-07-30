# Define the package directory for zerox
PACKAGE_DIR := py_zerox

# Define directory configs
VENV_DIR := .venv
DIST_DIR := ${PACKAGE_DIR}/dist
SRC_DIR := $(PACKAGE_DIR)/src
TEST_DIR := $(PACKAGE_DIR)/tests

# Define the build configs
POETRY_VERSION := 1.8.3
PYTHON_VERSION := 3.11
POETRY := poetry

# Test related configs
PYTEST_OPTIONS := -v

# Default target
.PHONY: all
all: venv build test dev

# Conditional map executable
ifeq ($(VIRTUAL_ENV),)
    PYTHON := python$(PYTHON_VERSION)
else
    PYTHON := python
endif

# Initialization
.PHONY: init
init:
	@echo "== Initializing Development Environment =="
	brew install node
	brew install pre-commit
	curl -sSL https://install.python-poetry.org | $(PYTHON) -

	@echo "== Installing Pre-Commit Hooks =="
	pre-commit install
	pre-commit autoupdate
	pre-commit install --install-hooks
	pre-commit install --hook-type commit-msg

# Create virtual environment if it doesn't exist
.PHONY: venv
venv: $(VENV_DIR)/bin/activate

$(VENV_DIR)/bin/activate:
	@echo "== Creating Virtual Environment =="
	$(PYTHON) -m venv $(VENV_DIR)
	. $(VENV_DIR)/bin/activate && pip install --upgrade pip setuptools wheel
	touch $(VENV_DIR)/bin/activate

# Resolving dependencies and build the package using SetupTools
.PHONY: build
build: venv
	@echo "== Resolving dependencies and building the package using SetupTools =="
	$(PYTHON) setup.py sdist --dist-dir $(DIST_DIR)

# Install test dependencies for test environment
.PHONY: install-test
install-test: venv
	@echo "== Resolving test dependencies =="
	$(POETRY) install --with test

# Test out the build
.PHONY: test
test: install-test
	@echo "== Triggering tests =="
	pytest $(TEST_DIR) $(PYTEST_OPTIONS) || (echo "Tests failed" && exit 1)

# Clean build artifacts
.PHONY: clean
clean:
	@echo "== Cleaning DIST_DIR and VENV_DIR =="
	rm -rf $(DIST_DIR)
	rm -rf $(VENV_DIR)

# Install dev dependencies for dev environment
.PHONY: install-dev
install-dev: venv build
	@echo "== Resolving development dependencies =="
	$(POETRY) install --with dev

# Package Development Build
.PHONY: dev
dev:
	@echo "== Preparing development build =="
	$(PYTHON) -m pip install -e .

.PHONY: check
check: install-dev lint format

.PHONY: lint
lint: venv
	@echo "== Running Linting =="
	$(VENV_DIR)/bin/ruff lint $(SRC_DIR) $(TEST_DIR)

.PHONY: format
format: venv
	@echo "== Running Formatting =="
	$(VENV_DIR)/bin/black --check $(SRC_DIR) $(TEST_DIR)