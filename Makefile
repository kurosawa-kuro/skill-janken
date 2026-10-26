.PHONY: setup deps build run dev test fmt lint check

# npm is the canonical interface; make is an optional convenience wrapper.
setup: deps build

deps:
	npm ci

build:
	npm run build

run dev:
	npm run preview

test:
	npm test

fmt:
	npm run format

lint:
	npm run format:check

check:
	npm run check
