#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/32f6140f6ae639ecee7814efc8fb487b84c1d275d908deffb28952aeeef94935/contract';
import startContract from '../../snapshots/32f6140f6ae639ecee7814efc8fb487b84c1d275d908deffb28952aeeef94935/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f155bc49fab459b60ce76553a86e689329b38d05821541b9d57191049915b294/contract';
import endContract from '../../snapshots/f155bc49fab459b60ce76553a86e689329b38d05821541b9d57191049915b294/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  foreignKey,
  primaryKey,
  unique,
} from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        table: 'ledger_files',
        columns: [
          col('created_at', 'TEXT', { notNull: true }),
          col('id', 'CHARACTER', { notNull: true }),
          col('key', 'TEXT', { notNull: true }),
          col('ledger_id', 'TEXT', { notNull: true }),
          col('updated_at', 'TEXT', { notNull: true }),
          col('version', 'TEXT'),
        ],
        constraints: [
          primaryKey(['id']),
          unique(['ledger_id', 'key']),
          foreignKey(['ledger_id'], 'ledgers', ['id'], { onDelete: 'cascade' }),
        ],
      }),
      this.createTable({
        table: 'postings',
        columns: [
          col('account', 'TEXT', { notNull: true }),
          col('amount', 'INTEGER'),
          col('created_at', 'TEXT', { notNull: true }),
          col('id', 'CHARACTER', { notNull: true }),
          col('position', 'INTEGER', { notNull: true }),
          col('transaction_id', 'TEXT', { notNull: true }),
          col('updated_at', 'TEXT', { notNull: true }),
        ],
        constraints: [
          primaryKey(['id']),
          foreignKey(['transaction_id'], 'transactions', ['id'], { onDelete: 'cascade' }),
        ],
      }),
      this.createTable({
        table: 'transactions',
        columns: [
          col('created_at', 'TEXT', { notNull: true }),
          col('date', 'TEXT', { notNull: true }),
          col('description', 'TEXT', { notNull: true }),
          col('file_id', 'TEXT', { notNull: true }),
          col('id', 'CHARACTER', { notNull: true }),
          col('line', 'INTEGER', { notNull: true }),
          col('updated_at', 'TEXT', { notNull: true }),
        ],
        constraints: [
          primaryKey(['id']),
          foreignKey(['file_id'], 'ledger_files', ['id'], { onDelete: 'cascade' }),
        ],
      }),
      this.createIndex({
        table: 'ledger_files',
        index: 'ledger_files_ledger_id_idx_828febee',
        columns: ['ledger_id'],
      }),
      this.createIndex({
        table: 'postings',
        index: 'postings_transaction_id_idx_d55c89e2',
        columns: ['transaction_id'],
      }),
      this.createIndex({
        table: 'transactions',
        index: 'transactions_file_id_idx_4f0f24cb',
        columns: ['file_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
