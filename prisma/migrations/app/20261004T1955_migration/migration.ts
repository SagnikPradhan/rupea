#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/ba7a9c49840241a315c59676c7d5d136b27ca133727c76d0f33accb39e98f5e6/contract';
import endContract from '../../snapshots/ba7a9c49840241a315c59676c7d5d136b27ca133727c76d0f33accb39e98f5e6/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  foreignKey,
  primaryKey,
  unique,
} from '@prisma/orm-sqlite/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        table: 'email_codes',
        columns: [
          col('code_hash', 'TEXT', { notNull: true }),
          col('created_at', 'TEXT', { notNull: true }),
          col('email', 'TEXT', { notNull: true }),
          col('expires_at', 'TEXT', { notNull: true }),
          col('id', 'CHARACTER', { notNull: true }),
          col('updated_at', 'TEXT', { notNull: true }),
        ],
        constraints: [primaryKey(['id']), unique(['email'])],
      }),
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
        table: 'ledgers',
        columns: [
          col('created_at', 'TEXT', { notNull: true }),
          col('id', 'CHARACTER', { notNull: true }),
          col('name', 'TEXT', { notNull: true }),
          col('updated_at', 'TEXT', { notNull: true }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        table: 'memberships',
        columns: [
          col('created_at', 'TEXT', { notNull: true }),
          col('id', 'CHARACTER', { notNull: true }),
          col('ledger_id', 'TEXT', { notNull: true }),
          col('role', 'TEXT', { notNull: true }),
          col('updated_at', 'TEXT', { notNull: true }),
          col('user_id', 'TEXT', { notNull: true }),
        ],
        constraints: [
          primaryKey(['id']),
          unique(['user_id', 'ledger_id']),
          foreignKey(['user_id'], 'users', ['id'], { onDelete: 'cascade' }),
          foreignKey(['ledger_id'], 'ledgers', ['id'], { onDelete: 'cascade' }),
        ],
      }),
      this.createTable({
        table: 'postings',
        columns: [
          col('account', 'TEXT', { notNull: true }),
          col('amount', 'INTEGER', { notNull: true }),
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
        table: 'sessions',
        columns: [
          col('created_at', 'TEXT', { notNull: true }),
          col('expires_at', 'TEXT', { notNull: true }),
          col('id', 'CHARACTER', { notNull: true }),
          col('token_hash', 'TEXT', { notNull: true }),
          col('updated_at', 'TEXT', { notNull: true }),
          col('user_id', 'TEXT', { notNull: true }),
        ],
        constraints: [
          primaryKey(['id']),
          unique(['token_hash']),
          foreignKey(['user_id'], 'users', ['id'], { onDelete: 'cascade' }),
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
          col('time', 'TEXT'),
          col('updated_at', 'TEXT', { notNull: true }),
        ],
        constraints: [
          primaryKey(['id']),
          foreignKey(['file_id'], 'ledger_files', ['id'], { onDelete: 'cascade' }),
        ],
      }),
      this.createTable({
        table: 'users',
        columns: [
          col('created_at', 'TEXT', { notNull: true }),
          col('email', 'TEXT', { notNull: true }),
          col('id', 'CHARACTER', { notNull: true }),
          col('ledger_id', 'TEXT'),
          col('updated_at', 'TEXT', { notNull: true }),
        ],
        constraints: [
          primaryKey(['id']),
          unique(['email']),
          foreignKey(['ledger_id'], 'ledgers', ['id']),
        ],
      }),
      this.createIndex({
        table: 'ledger_files',
        index: 'ledger_files_ledger_id_idx_828febee',
        columns: ['ledger_id'],
      }),
      this.createIndex({
        table: 'memberships',
        index: 'memberships_ledger_id_idx_828febee',
        columns: ['ledger_id'],
      }),
      this.createIndex({
        table: 'memberships',
        index: 'memberships_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        table: 'postings',
        index: 'postings_transaction_id_idx_d55c89e2',
        columns: ['transaction_id'],
      }),
      this.createIndex({
        table: 'sessions',
        index: 'sessions_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        table: 'transactions',
        index: 'transactions_file_id_idx_4f0f24cb',
        columns: ['file_id'],
      }),
      this.createIndex({
        table: 'users',
        index: 'users_ledger_id_idx_828febee',
        columns: ['ledger_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
