PYTHON ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python3)

.PHONY: test demo
test:
	$(PYTHON) -m pytest -q

demo:
	@set -eu; demo_home=$$(mktemp -d); trap 'rm -rf "$$demo_home"' EXIT HUP INT TERM; \
	export LED_TASSO_HOME="$$demo_home"; \
	$(PYTHON) -m led_tasso --backend fake ask "My name is Rowan. I am training for a 5K."; \
	$(PYTHON) -m led_tasso --backend fake ask "What should I work on today?"; \
	$(PYTHON) -m led_tasso --backend fake memory list
