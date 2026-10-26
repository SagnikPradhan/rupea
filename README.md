# Rupea

[![Coverage](https://coveralls.io/repos/github/SagnikPradhan/rupea/badge.svg?branch=master)](https://coveralls.io/github/SagnikPradhan/rupea?branch=master)
[![Reliability](https://sonarcloud.io/api/project_badges/measure?project=rupea&metric=reliability_rating)](https://sonarcloud.io/summary/overall?id=rupea)

**Know where every rupee went.**

Every account, every statement, one ledger, in files you own.

> Work in progress, not ready for use.

<table>
	<tr>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="docs/images/expenses-dark.png">
				<img alt="Spending by month over two years" src="docs/images/expenses-light.png">
			</picture>
		</td>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="docs/images/expenses-flow-dark.png">
				<img alt="How spending divides into accounts" src="docs/images/expenses-flow-light.png">
			</picture>
		</td>
	</tr>
	<tr>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="docs/images/accounts-dark.png">
				<img alt="Net worth over six years, by account" src="docs/images/accounts-light.png">
			</picture>
		</td>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="docs/images/investments-dark.png">
				<img alt="Investments narrowed to one account" src="docs/images/investments-light.png">
			</picture>
		</td>
	</tr>
	<tr>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="docs/images/transactions-dark.png">
				<img alt="Transactions from every file, newest first" src="docs/images/transactions-light.png">
			</picture>
		</td>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="docs/images/postings-dark.png">
				<img alt="Postings to one account and its children" src="docs/images/postings-light.png">
			</picture>
		</td>
	</tr>
	<tr>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="docs/images/lots-dark.png">
				<img alt="The lots of a holding, with gains on each sale" src="docs/images/lots-light.png">
			</picture>
		</td>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="docs/images/files-dark.png">
				<img alt="A ledger file, plain text you own" src="docs/images/files-light.png">
			</picture>
		</td>
	</tr>
</table>

## Quick start

```sh
pnpm install
cp .env.example .env
pnpm dev
```

The first run downloads the ML models for statement import into `data/models`. How to use Rupea is in the [manual](docs/manual/README.md).

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
