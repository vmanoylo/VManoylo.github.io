import { sexpr, toSexpr } from "./sexpr";

export type LambdaExpr =
  | { type: "var"; val: variable }
  | { type: "lambda"; val: Lambda }
  | { type: "apply"; val: [LambdaExpr, LambdaExpr] };

interface variable {
  i: number; // debruijn index, or -1 for free variables
  s: string;
}

interface Lambda {
  param: string;
  body: LambdaExpr;
}

function toLambdaExpr(s: sexpr, e: string[] = []): LambdaExpr {
  if (!Array.isArray(s)) {
    return { type: "var", val: { i: e.indexOf(s), s } };
  }
  s = s as sexpr[];
  if (s.length == 0) {
    throw new Error("empty expr");
  }
  if (s.length == 1) {
    // unnesting
    return toLambdaExpr(s[0], e);
  }
  if (s[0] == "lambda") {
    // (lambda (params...) body)
    if (!Array.isArray(s[1]) || s[1].length == 0) {
      throw new Error("need parameters");
    }
    let params: string[] = s[1].map((x) => x as string).reverse();
    let body: LambdaExpr = toLambdaExpr(s.slice(2), [...params, ...e]);
    let lambda: Lambda = { param: params[0] as string, body };
    for (let i = 1; i < params.length; i++) 
      lambda = { param: params[i], body: { type: "lambda", val: lambda } };
    return { type: "lambda", val: lambda };
  } else {
    // application
    let l: LambdaExpr[] = s.map((x) => toLambdaExpr(x, e));
    return l.slice(1).reduce((prev, curr) => {
      return { type: "apply", val: [prev, curr] };
    }, l[0]);
  }
}

export function read(str: string): LambdaExpr {
  return toLambdaExpr(toSexpr(str));
}

function formatSimple(expr: LambdaExpr): string {
  switch (expr.type) {
    case "var":
      return expr.val.s;
    case "lambda":
      return `λ${expr.val.param}.${formatSimple(expr.val.body)}`;
    case "apply":
      return `(${formatSimple(expr.val[0])} ${formatSimple(expr.val[1])})`;
  }
}

function formatDebruijn(expr: LambdaExpr): string {
  switch (expr.type) {
    case "var":
      return expr.val.i === -1 ? expr.val.s : (expr.val.i + 1).toString();
    case "lambda":
      return `λ ${formatDebruijn(expr.val.body)}`;
    case "apply":
      return `(${formatDebruijn(expr.val[0])} ${formatDebruijn(expr.val[1])})`;
  }
}

export function format(
  expr: LambdaExpr,
  fmt: "simple" | "debruijn" = "simple"
): string {
  switch (fmt) {
    case "simple":
      return formatSimple(expr);
    case "debruijn":
      return formatDebruijn(expr);
  }
}

export type Env = Record<string, LambdaExpr>;

function varNames(expr: LambdaExpr): Set<string> {
  switch (expr.type) {
    case "var":
      return new Set<string>();
    case "lambda":
      return varNames(expr.val.body).add(expr.val.param);
    case "apply":
      return new Set<string>(
        ...varNames(expr.val[0]),
        ...varNames(expr.val[1])
      );
  }
}

function nextName(expr: LambdaExpr, str: string): string {
  let names = varNames(expr);
  while (names.has(str)) {
    str += "'";
  }
  return str;
}

function rename(
  expr: LambdaExpr,
  from: string,
  to: string = nextName(expr, from)
): LambdaExpr {
  switch (expr.type) {
    case "var":
      if (expr.val.s === from) expr.val.s = to;
      break;
    case "lambda":
      if (expr.val.param === from) expr.val.param = to;
      expr.val.body = rename(expr.val.body, from, to);
      break;
    case "apply":
      expr.val = [rename(expr.val[0], from, to), rename(expr.val[1], from, to)];
      break;
  }
  return expr;
}

export function evalLambda(expr: LambdaExpr, env: Env): LambdaExpr {
  // TODO: continuation instead of step-wise eval
  // console.log("call", exprString(expr), env);
  switch (expr.type) {
    case "var":
      return env[expr.val.s] || expr;
    case "lambda":
      if (expr.val.param in env) {
        expr = rename(expr, expr.val.param);
        if (expr.type != "lambda")
          throw new Error("rename changed the type somehow");
      }
      expr.val.body = evalLambda(expr.val.body, env);
      return expr;
    case "apply":
      let fun: LambdaExpr = evalLambda(expr.val[0], env);
      let arg: LambdaExpr = evalLambda(expr.val[1], env);
      switch (fun.type) {
        case "lambda":
          let newEnv = { ...env, [fun.val.param]: arg };
          // console.log("env", env, "->", newEnv);
          return evalLambda(fun.val.body, newEnv);
        case "var":
        case "apply":
          return { type: "apply", val: [fun, arg] };
      }
  }
}
