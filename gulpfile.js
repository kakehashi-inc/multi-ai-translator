import gulp from 'gulp';
import { deleteAsync } from 'del';
import eslint from 'gulp-eslint-new';
import gulpStylelint from 'gulp-stylelint-esm';
import jsonlint from '@prantlf/gulp-jsonlint';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Clean dist directory
 */
export function clean() {
  return deleteAsync(['dist', 'dist-firefox', 'packages']);
}

/**
 * Run ESLint
 */
export function lintScripts() {
  return gulp
    .src(['src/**/*.{ts,tsx,js,jsx}'])
    .pipe(eslint({ fix: false }))
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
}

function formatStylelintResults(results) {
  return results
    .map((result) =>
      result.warnings
        .map(
          (warning) =>
            `${result.source ?? 'unknown'} [${warning.severity}] (${warning.rule}) ${warning.text} at line ${warning.line}, column ${warning.column}`
        )
        .join('\n')
    )
    .filter(Boolean)
    .join('\n');
}

export function lintCss() {
  return gulp
    .src(['src/**/*.css', 'src/**/*.scss', '!src/scss/_tokens.scss'])
    .pipe(
      gulpStylelint({
        failAfterError: true,
        reporters: [{ formatter: formatStylelintResults, console: true }]
      })
    );
}

export function lintJson() {
  return gulp
    .src([
      '*.json',
      'src/**/*.json',
      'Documents/**/*.json',
      'manifest*.json',
      '!node_modules/**',
      '!dist/**',
      '!dist-firefox/**'
    ])
    .pipe(jsonlint())
    .pipe(jsonlint.reporter());
}

/**
 * Run TypeScript type checking
 */
export function lintTypeScript(done) {
  execAsync('tsc --noEmit')
    .then(({ stdout, stderr }) => {
      if (stderr) {
        console.error(stderr);
      }
      if (stdout) {
        console.log(stdout);
      }
      done();
    })
    .catch((error) => {
      console.error('TypeScript type checking failed:');
      if (error.stdout) {
        console.error(error.stdout);
      }
      if (error.stderr) {
        console.error(error.stderr);
      }
      done(error);
    });
}

export const lint = gulp.parallel(lintScripts, lintTypeScript, lintCss, lintJson);
