import { LambdaExpr, format, read } from "./lambda.js";

/** each step of an expression being computed */
let history: LambdaExpr[] = [];
let env: Record<string, LambdaExpr> = {};
let envTable = document.getElementById("env") as HTMLTableElement;
let input = document.getElementById("input") as HTMLTextAreaElement;
let output = document.getElementById("output") as HTMLTableElement;

{
  // sample starting state
  // let exprStr = `(lambda (n f x) f (n f x)) (lambda (f x) f x)`;
  let exprStr = `SUCC 0`;
  input.textContent = exprStr;
  pushExpr(read(exprStr));
}

{
  let sampleEnv = [
    ["S", "(lambda (a b c) a c (b c))"],
    ["K", "(lambda (a b) a)"],
    ["I", "(lambda (a) a)"],
    ["KI", "(lambda (a b) (K I))"],
    ["Ki", "(lambda (a b) b)"],
    ["M", "(lambda (a) a a)"],
    ["Omega", "(lambda (a) (a a)(a a))"],
    ["Y", "(lambda (a) Y (lambda (b) a (b b)))"],
    ["TRUE", "(lambda (a b) a)"],
    ["FALSE", "(lambda (a b) b)"],
    ["NOT", "(lambda (p) (p I))"],
    ["AND", "(lambda (p q) (p q p))"],
    ["OR", "(lambda (p q) (p p q))"],
    ["zero", "(lambda (a b) b)"],
    ["one", "(lambda (a b) a b)"],
    ["two", "(lambda (a b) a (a b))"],
    ["zero?", "(lambda (n) n (lambda (a) Ki) K)"],
    ["SUCC", "(lambda (n f x) (f (n f x)))"],
    ["+", "(lambda (m n) (m SUCC n))"],
    ["*", "(lambda (m n) (m (plus n) 0))"],
    ["^", "(lambda (b e) (e b))"],
    ["cons", "(lambda (a b) (lambda (p) p a b))"],
    ["car", "(lambda (l) (l K))"],
    ["cdr", "(lambda (l) (l Ki))"],
    ["nil", "(lambda (p) K)"],
    ["nil?", "(lambda (l) (l (lambda (a b) Ki)))"],
  ];
  for (let it of sampleEnv) {
    let e = read(it[1]);
    env[it[0]] = e;
    envTable.insertAdjacentHTML(
      "beforeend",
      `<tr><td>${it[0]}</td><td>${format(e)}</td></tr>`
    );
  }
}

/** Add a new step to the expression being computed */
function pushExpr(expr: LambdaExpr) {
  history.push(expr);
  let tr = document.createElement("tr");
  let td = document.createElement("td");
  td.appendChild(toHtml(expr));

  tr.appendChild(td);
  tr.insertAdjacentHTML("beforeend", `<td>${format(expr)}</td>`);
  tr.insertAdjacentHTML("beforeend", `<td>${format(expr, "debruijn")}</td>`);
  output.appendChild(tr);
}

function subst(expr: LambdaExpr, param: string, arg: LambdaExpr): LambdaExpr {
  switch (expr.type) {
    case "var":
      return expr.val.s === param ? arg : expr;
    case "lambda":
      if (expr.val.param === param) return expr;
      expr.val.body = subst(expr.val.body, param, arg);
      return expr;
    case "apply":
      expr.val[0] = subst(expr.val[0], param, arg);
      expr.val[1] = subst(expr.val[1], param, arg);
      return expr;
  }
}

/**
 * index into the lambda expresion
 * e.g. in (lambda (f x) (f (f x)))
 * "" -> the whole thing
 * "L"   -> (f (f x))
 * "L0"  -> outer f
 * "L1"  -> (f x)
 * "L10" -> inner f
 * "L11" -> x
 */
function get(expr: LambdaExpr, index: string): LambdaExpr {
  if (index.length === 0)
    return expr;
  let rest = index.slice(1);
  switch (index[0]) {
    case "L":
      if (expr.type != "lambda") throw new Error("bad index");
      return get(expr.val.body, rest);
    case "0":
      if (expr.type != "apply") throw new Error("bad index");
      return get(expr.val[0], rest);
    case "1":
      if (expr.type != "apply") throw new Error("bad index");
      return get(expr.val[1], rest);
    default:
      throw new Error("unknown index");
  }
}

/** puts val at index, doesn't work for starting index because javascript */
function swapout(expr: LambdaExpr, val: LambdaExpr, index: string) {
  if (index.length === 0)
    throw new Error("empty index");
  let parent = get(expr, index.slice(0, index.length - 1));
  switch (index[index.length - 1]) {
    case "L":
      if (parent.type != "lambda") throw new Error("bad index");
      parent.val.body = val;
      break;
    case "0":
      if (parent.type != "apply") throw new Error("bad index");
      parent.val[0] = val;
      break;
    case "1":
      if (parent.type != "apply") throw new Error("bad index");
      parent.val[1] = val;
      break;
  }
}

/** looks for a symbol in the environment, and church numerals */
function lookup(s: string): LambdaExpr | undefined {
  if (s in env) return window.structuredClone(env[s]);
  if (/^\d+$/.test(s)) {
    let n = +s;
    return read(`lambda (f x) ${"(f".repeat(n)} x ${")".repeat(n)}`);
  }
  return undefined;
}

/** returns an event handler for reducing the lambda expression at the index */
function clickLambda(index: string) {
  let length = history.length;
  return (event: MouseEvent) => {
    event.stopPropagation();
    while (history.length > length) {
      history.pop();
      output.removeChild(output.lastChild!);
    }
    if (history.length < length) throw new Error("unreachable");
    let expr = structuredClone(history[length - 1]);
    let subexpr = get(expr, index);
    let result;
    if (subexpr.type === "var" && subexpr.val.i === 0) {
      result = lookup(subexpr.val.s);
    } else if (subexpr.type == "apply" && subexpr.val[0].type == "lambda") {
      let [l, r] = subexpr.val;
      result = subst(l.val.body, l.val.param, r);
    }
    if (result !== undefined) {
      if (index === "") pushExpr(result);
      else {
        swapout(expr, result, index);
        pushExpr(expr);
      }
    }
  };
}

/**
 * converts a lambda into a structured div, with event listeners tied to divs that can compute parts of the expression.
 * the id parameter is used for convenience in recursion, don't pass anything in.
 */
function toHtml(expr: LambdaExpr, id: string = ""): HTMLDivElement {
  let ret: HTMLDivElement = document.createElement("div");
  ret.classList.add("expr");
  ret.id = id;
  switch (expr.type) {
    case "var":
      ret.classList.add("var");
      if (expr.val.i == 0) {
        ret.classList.add("free");
        ret.classList.add("clickable");
        ret.addEventListener("click", clickLambda(id));
      }
      ret.innerHTML = expr.val.s;
      return ret;
    case "lambda":
      ret.classList.add("lambda");
      let param = document.createElement("div");
      param.innerHTML = `λ${expr.val.param}.`;
      ret.append(param, toHtml(expr.val.body, id + "L"));
      return ret;
    case "apply":
      ret.classList.add("apply");
      let [l, r] = [
        toHtml(expr.val[0], id + "0"),
        toHtml(expr.val[1], id + "1"),
      ];
      ret.append(l, r);
      if (l.classList.contains("lambda")) {
        ret.classList.add("clickable");
        ret.addEventListener("click", clickLambda(id));
      }
      return ret;
  }
}

input.addEventListener("input", (event) => {
  let k: string = (event.target as HTMLInputElement).value;
  let expr: LambdaExpr;
  try {
    expr = read(k);
    history = [];
    output.innerHTML = "";
    pushExpr(expr);
  } catch (err) {
    // console.log("invalid", k);
  }
});
