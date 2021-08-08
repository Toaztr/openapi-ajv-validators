#!/usr/bin/env node 

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

import { bold, green, red } from 'kleur';
import * as meow from 'meow';

import Ajv from 'ajv';
import addFormat from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone';

const cli = meow(
  `Usage
  $ openapi-ajv-validators [options] [input]

Input
  path to openapi json document

Options
  --help                display this
  --outputFile, -o      Specify output file
  --schemas, -s         Paths to schemas
  --schemasPrefix, -p   (optional) Path prefix to use for schemas
`,
  {
    flags: {
      outputFile: {
        type: 'string',
        alias: 'o',
        isRequired: true
      },
      schemas: {
        isMultiple: true,
        isRequired: true,
        type: 'string',
        alias: 's'
      },
      schemasPrefix: {
        type: 'string',
        alias: 'p'
      }
    }
  }
);

const timeStart = process.hrtime();

const writeFile = util.promisify(fs.writeFile);

async function generateValidator(outputFile: string, ajv: Ajv, prefix: string, names: string[]) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    await Promise.all([
        writeFile(`${outputFile}.js`, standaloneCode(ajv, names.reduce((o, n) => ({
                ...o,
                [`validate${n}`]: `${prefix}${n}`
            }),
            {}
        ))).then(() => console.log(`✔ ${outputFile}.js`)),
        writeFile(`${outputFile}.d.ts`, `
            type ValidationFunction = { (data: any): boolean, errors?: { message?: string, instancePath?: string }[] };
            ${names.map((n) => `export const validate${n}: ValidationFunction;`).join('\n')}
        `).then(() => console.log(`✔ ${outputFile}.d.ts`))
    ]);
}

async function main() {
  console.info(bold('✨ openapi-ajv-validators'));

  try {
    const specPath = cli.input[0];
    if (!specPath) {
        throw new Error('Missing openapi input file');
    }
    const ajv = new Ajv({
      code: {
        source: true
      }, 
      validateSchema: false, 
      strict: false,
      removeAdditional: true,
      useDefaults: true 
    });
    ajv.addSchema(JSON.parse(
        fs.readFileSync(
            path.resolve(process.cwd(), specPath)
        ).toString()
    ));
    addFormat(ajv);

    const outputFile = path.resolve(process.cwd(), cli.flags.outputFile);
    const schemasPrefix = cli.flags.schemasPrefix ?? '';
    await generateValidator(outputFile, ajv, schemasPrefix, cli.flags.schemas);
    
    const timeEnd = process.hrtime(timeStart);
    const time = timeEnd[0] + Math.round(timeEnd[1] / 1e6);
    console.log(green(`🚀 ${specPath} → ${bold(outputFile)} [${time}ms]`));
  } catch (err) {
    process.exitCode = 1; // needed for async functions
    throw new Error(red(`❌ ${err}`));
  }
}

main();
