# One command builds the note: `make -C docs/paper` (or `make` in this folder).
# Engine: tectonic (brew install tectonic), which fetches IEEEtran, tikz and booktabs on first use.
# numbers.tex is regenerated from the result files every build so no number is ever typed by hand.
PY ?= python3
TECTONIC ?= tectonic
BASELINE ?= ../../bench/BASELINE.json

.PHONY: all check clean

all: caliber.pdf

numbers.tex: numbers.py ../FACTS.json $(BASELINE) ../../bench/carrierbench/REPORT.json ../../bench/carrierbench/oracle.json ../../bench/carrierbench/saboteur.json ../../spacetimedb/src/thresholds.ts
	$(PY) numbers.py --baseline $(BASELINE) --out numbers.tex

caliber.pdf: caliber.tex numbers.tex
	$(TECTONIC) caliber.tex

check: caliber.pdf
	@pages=$$(pdfinfo caliber.pdf | awk '/^Pages:/ {print $$2}'); echo "pages: $$pages"; [ "$$pages" -le 4 ]
	@if grep -nP '\x{2014}' caliber.tex numbers.tex; then echo "em dash found"; exit 1; else echo "no em dash"; fi

clean:
	rm -f caliber.pdf numbers.tex numbers_map.json
