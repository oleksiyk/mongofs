all: mongofs

node_modules: package.json
	@npm install


mongofs: node_modules lib/*


#
# Tests
#
test: mongofs
	@MONGOFS_TEST_DBNAME=mongofs-test mocha


#
# Coverage
#
lib-cov: clean-cov
	@jscoverage --no-highlight lib lib-cov

test-cov: lib-cov
	@MONGOFS_COV=1 MONGOFS_TEST_DBNAME=mongofs-test mocha \
		--require ./test/globals \
		--reporter html-cov \
		> coverage.html

#
# Clean up
#

clean: clean-node clean-cov

clean-node:
	@rm -rf node_modules

clean-cov:
	@rm -rf lib-cov
	@rm -f coverage.html

.PHONY: all
.PHONY: test

