# Rupee

[![Coverage](https://coveralls.io/repos/github/SagnikPradhan/rupee/badge.svg?branch=master)](https://coveralls.io/github/SagnikPradhan/rupee?branch=master)

**Know where every rupee went.**

Every account, every statement, one ledger, in files you own.

> Work in progress, not ready for use.

## Quick start

```sh
pnpm install
cp .env.example .env
pnpm dev
```

The first run downloads the ML models for statement import into `data/models`. How to use Rupee is in the [manual](docs/manual/README.md).

## Development

```sh
pnpm models
pnpm test
pnpm test:e2e
pnpm check
pnpm lint
```

Domain terms are in [GLOSSARY.md](GLOSSARY.md), decisions in [docs/adr](docs/adr), plans in [ROADMAP.md](ROADMAP.md).

## License

[MIT](LICENSE)
