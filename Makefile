# Quoting MAKEFILE_LIST keeps the checkout path usable when it contains spaces.
PROJECT_DIR := $(shell cd "$$(dirname '$(strip $(MAKEFILE_LIST))')" && pwd)
PYTHON ?= $(shell if test -x '$(PROJECT_DIR)/.venv/bin/python'; then printf '%s' '$(PROJECT_DIR)/.venv/bin/python'; else printf '%s' python3; fi)

.PHONY: test demo serve
test:
	cd '$(PROJECT_DIR)' && '$(PYTHON)' -m pytest -q

demo:
	@set -eu; cd '$(PROJECT_DIR)'; demo_home=$$(mktemp -d); trap 'rm -rf "$$demo_home"' EXIT HUP INT TERM; \
	export LED_TASSO_HOME="$$demo_home"; \
	'$(PYTHON)' -m led_tasso --backend fake ask "My name is Rowan. I am training for a 5K."; \
	'$(PYTHON)' -m led_tasso --backend fake ask "What should I work on today?"; \
	'$(PYTHON)' -m led_tasso --backend fake memory list

serve:
	cd '$(PROJECT_DIR)' && '$(PYTHON)' -m led_tasso --backend fake serve
