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
				<source media="(prefers-color-scheme: dark)" srcset="site/public/screenshots/expenses-dark.png">
				<img alt="Spending by month over two years" src="site/public/screenshots/expenses-light.png">
			</picture>
		</td>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="site/public/screenshots/expenses-flow-dark.png">
				<img alt="How spending divides into accounts" src="site/public/screenshots/expenses-flow-light.png">
			</picture>
		</td>
	</tr>
	<tr>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="site/public/screenshots/accounts-dark.png">
				<img alt="Net worth over six years, by account" src="site/public/screenshots/accounts-light.png">
			</picture>
		</td>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="site/public/screenshots/investments-dark.png">
				<img alt="Investments narrowed to one account" src="site/public/screenshots/investments-light.png">
			</picture>
		</td>
	</tr>
	<tr>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="site/public/screenshots/transactions-dark.png">
				<img alt="Transactions from every file, newest first" src="site/public/screenshots/transactions-light.png">
			</picture>
		</td>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="site/public/screenshots/postings-dark.png">
				<img alt="Postings to one account and its children" src="site/public/screenshots/postings-light.png">
			</picture>
		</td>
	</tr>
	<tr>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="site/public/screenshots/lots-dark.png">
				<img alt="The lots of a holding, with gains on each sale" src="site/public/screenshots/lots-light.png">
			</picture>
		</td>
		<td width="50%">
			<picture>
				<source media="(prefers-color-scheme: dark)" srcset="site/public/screenshots/files-dark.png">
				<img alt="A ledger file, plain text you own" src="site/public/screenshots/files-light.png">
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

The first run downloads the ML models for statement import into `data/models`. How to use Rupea is in the [manual](site/src/content/manual/index.md).

## Development

```sh
pnpm models
pnpm test
pnpm test:e2e
pnpm check
pnpm lint
```

`pnpm replay <folder>` predicts each statement in a ledger folder from the ones before it, and reports how many lines it got right; `--cold` predicts with no history, as for a new user. Run it before and after a change to prediction.

Domain terms are in [GLOSSARY.md](GLOSSARY.md), decisions in [docs/adr](docs/adr), plans in [ROADMAP.md](ROADMAP.md).

## License

[MIT](LICENSE)
