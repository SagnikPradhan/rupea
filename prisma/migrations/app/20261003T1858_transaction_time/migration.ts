#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0a1efedef3d87f3c09a4c2794acfa89b37a9b24ca9c75e2e2894acd20a1a0bf7/contract';
import endContract from '../../snapshots/0a1efedef3d87f3c09a4c2794acfa89b37a9b24ca9c75e2e2894acd20a1a0bf7/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f155bc49fab459b60ce76553a86e689329b38d05821541b9d57191049915b294/contract';
import startContract from '../../snapshots/f155bc49fab459b60ce76553a86e689329b38d05821541b9d57191049915b294/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        table: 'transactions',
        column: { name: 'time', typeSql: 'TEXT', defaultSql: '', nullable: true },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
