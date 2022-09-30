# TypeScript

TypeScript is, in our opinion, the best language to write your Screeps codebase in. It combines the familiarity of JavaScript with the power of static typing.

Static type checkers like TypeScript and [Flow](https://flow.org/) help reduce the amount of bugs in your code by detecting type errors during compile time. In general, using static typing in your JavaScript code [can help prevent about 15%](https://blog.acolyer.org/2017/09/19/to-type-or-not-to-type-quantifying-detectable-bugs-in-javascript/) of the bugs that end up in committed code. Not only static typing, TypeScript also provides various productivity enhancements like advanced statement completion, as well as smart code refactoring.

To read more about how TypeScript can help you in Screeps, read [this Screeps World article](https://screepsworld.com/2017/07/typescreeps-getting-started-with-ts-in-screeps/) by [@bonzaiferroni](https://github.com/bonzaiferroni).

This section provides TypeScript-specific tips & tricks for you to make the best out of the ecosystem.

## Strict mode

The `--strict` compiler flag was introduced in TypeScript 2.3 which activates TypeScript's "strict mode". The strict mode sets all strict typechecking options to `true` by default.

As of TypeScript 2.7, the affected options are:

* `--noImplicitAny`
* `--noImplicitThis`
* `--alwaysStrict`
* `--strictNullChecks`
* `--strictFunctionTypes`
* `--strictPropertyInitialization`

Starting from version 2.0 of the starter kit, we've enabled the `--strict` flag in `tsconfig.json`. If this gives you compile time errors, you can try setting `"strict"` to `false`, or by overriding one or more of the options listed above.

**For more info:** [https://blog.mariusschulz.com/2017/06/09/typescript-2-3-the-strict-compiler-option](https://blog.mariusschulz.com/2017/06/09/typescript-2-3-the-strict-compiler-option)

## ESLint

ESLint checks your TypeScript (and JavaScript) code for readability, maintainability, and functionality errors, and can also enforce coding style standards.

This project provides ESLint rules through a `.eslintrc.js` file, which extends the recommended rules from ESLint defined [here](https://eslint.org/docs/rules/).

We've made some changes to these rules, which we considered necessary and/or relevant to a proper Screeps project:

* set the [guard-for-in](https://eslint.org/docs/rules/guard-for-in) rule to `off`, it was forcing `for ( ... in ...)` loops to check if object members were not coming from the class prototype.
* set the [no-console](https://eslint.org/docs/rules/no-console) rule to `off`, in order to allow using `console`.
* set the [no-underscore-dangle](https://eslint.org/docs/rules/no-underscore-dangle) to `warn`.

### Customising ESLint

You can also customise your `.eslintrc.js` file to match the preferences of your codebase. Click [here](https://eslint.org/docs/user-guide/configuring/), to find out how, and click [here](https://eslint.org/docs/rules/) for a complete list of rules available.

If you believe that some rules should not apply to a part of your code \(e.g. for one-off cases like having to use `require()` to include a module\), you can use flags to let ESLint know about it: [https://eslint.org/docs/user-guide/configuring/rules#disabling-rules](https://eslint.org/docs/user-guide/configuring/rules#disabling-rules)

**More info about ESLint:** [https://eslint.org/](https://eslint.org/)

