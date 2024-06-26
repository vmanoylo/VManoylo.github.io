/**
 * @typedef {Object} Config
 * @prop {Object.<string, string>} env
 * @prop {Lambda[]} history - expression as its partially evalauted
 * @prop {string[]} evalable - list of indexes that can be evaled at the latest point
 * @prop {HTMLTextAreaElement} envElement
 * @prop {HTMLTextAreaElement} input
 * @prop {HTMLDivElement} output
 * @prop {HTMLTableElement} historyElement
 */
/** @type {Config} */
const config = {
    env: {},
    history: [],
    evalable: [],
    envElement: document.getElementById("env"),
    historyElement: document.getElementById("history"),
    input: document.getElementById("input"),
    output: document.getElementById("output"),
};

/**
 * @param {string} str
 * @returns {string[]}
 */
function toTokens(str) {
    let m = str.match(/[()]|[^()\s]+/g);
    return m === null ? [] : m;
}

/** @typedef {any[]|string} Sexpr */ // recursive types don't work in jsdoc
/**
 * @param {string[]} tokens
 * @returns {[Sexpr, number]}
 */
function tokensToSexpr(tokens) {
    let ret = [];
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i];
        if (t == "(") {
            const [s, i2] = tokensToSexpr(tokens.slice(i + 1));
            ret.push(s);
            i += i2;
        } else if (t == ")") {
            return [ret, i + 1];
        } else {
            ret.push(t);
        }
    }
    return [ret, tokens.length];
}
/**
 * @param {string} str
 * @returns {Sexpr}
 */
function toSexpr(str) {
    r = /[()]|[^()\s]+/g;
    const tokens = str.match(r);
    if (tokens === null) return "";
    return tokensToSexpr(tokens)[0];
}

/**
 * @typedef {Object} Lambda
 * @prop {'var'} type
 * @prop {LambdaVar} val
 * @prop {'fun'} type
 * @prop {LambdaFun} val
 * @prop {'apply'} type
 * @prop {LambdaApply} val
 *
 * @typedef LambdaVar
 * @prop {string} id
 *
 * @typedef LambdaFun
 * @prop {string[]} id
 * @prop {Lambda} body
 *
 * @typedef LambdaApply
 * @prop {Lambda} left
 * @prop {Lambda} right
 */

/**
 * @param {Sexpr} s
 * @returns {Lambda}
 */
function toLambda(s) {
    if (!Array.isArray(s)) {
        return { type: "var", val: { id: s } };
    }
    if (s[0] == "lambda") {
        const ids = s[1];
        if (ids.length == 1) {
            return { type: "fun", val: { id: ids[0], body: toLambda(s.slice(2)) } };
        }
        s[1] = s[1].slice(1);
        return { type: "fun", val: { id: ids[0], body: toLambda(s) } };
    }
    let apply = toLambda(s[0]);
    for (let i = 1; i < s.length; i++) {
        apply = { type: "apply", val: { left: apply, right: toLambda(s[i]) } };
    }
    return apply;
}

/**
 * @param {string} str
 * @returns {Lambda}
 */
function parse(str) {
    if (str.includes("\\")) {
        console.log("found backslash");
    }
    return toLambda(toSexpr(str));
}

/**
 * @param {Lambda} expr
 * @returns {string}
 */
function format(expr) {
    switch (expr.type) {
        case "var":
            return expr.val.id;
        case "fun":
            return `(lambda (${expr.val.id}) ${format(expr.val.body)})`;
        case "apply":
            return `(${format(expr.val.left)} ${format(expr.val.right)})`;
    }
}

/**
 * @param {Lambda} expr
 * @returns {string}
 */
function formatLambda(expr, paren = false) {
    switch (expr.type) {
        case "var":
            return expr.val.id;
        case "fun":
            return `λ${expr.val.id}.${formatLambda(expr.val.body, true)}`;
        case "apply":
            const s = `${formatLambda(expr.val.left)} ${formatLambda(
                expr.val.right,
                true
            )}`;
            return paren ? `(${s})` : s;
    }
}

/**
 * @param {Lambda} expr
 * @param {string[]} env
 * @returns {string}
 */
function formatDebruijn(expr, env = [], parent = false) {
    switch (expr.type) {
        case "var":
            const i = env.indexOf(expr.val.id);
            return i === -1 ? expr.val.id : "#" + i;
        case "fun":
            return `λ${formatDebruijn(expr.val.body, [expr.val.id, ...env], true)}`;
        case "apply":
            const s = `${formatDebruijn(expr.val.left, env)} ${formatDebruijn(
                expr.val.right,
                env,
                true
            )}`;
            return parent ? `(${s})` : s;
    }
}

/**
 * @param {Lambda} s
 * @returns {string} return match, or "" if not properly closed
 */
function matchParen(s) {
    let i = 0;
    for (; i < s.length && s[i] != "("; i++) {
        if (s[i] == ")") return s.slice(0, i); // no parens
    }
    if (i == s.length) return s; // no parens
    let c = 1;
    for (; i < s.length; i++) {
        if (s[i] == "(") c++;
        if (s[i] == ")") c--;
        if (c == 0) return s.slice(0, i); // found matching
    }
    return ""; // not fully closed
}

/**
 * @param {Lambda} expr
 * @param {string[]} env
 * @returns {string}
 * @example
 * formatEta(parse("(lambda (f x) (f (f x)))")) // "2"
 */
function formatEta(expr) {
    let s = formatDebruijn(expr);
    // swap in church numerals
    let swaps = [];
    r = /λλ(\(#1 )*#0/g;
    function swap(swaps) {
        while (swaps.length > 0) {
            // apply swaps in reverse order
            const [i, e, n] = swaps.pop();
            s = s.slice(0, i) + n + s.slice(e);
        }
    }
    while ((m = r.exec(s)) !== null) {
        const l = m[0].length;
        const n = (l - 4) / 4; // 4 is the length of "λλ(#0" and "(#1 "
        endparens = s.slice(m.index + l, m.index + l + n);
        if (endparens !== ")".repeat(n)) {
            continue;
        }
        swaps.push([m.index, m.index + l + n, String(n)]);
    }
    swap(swaps);
    return s;
}

/**
 * @param {Lambda} expr
 * @param {string} from
 * @param {Lambda} to
 * @returns {Lambda}
 */
function subst(expr, from, to) {
    switch (expr.type) {
        case "var":
            return expr.val.id == from ? to : expr;
        case "fun":
            if (expr.val.id == from) return expr;
            expr.val.body = subst(expr.val.body, from, to);
            return expr;
        case "apply":
            expr.val.left = subst(expr.val.left, from, to);
            expr.val.right = subst(expr.val.right, from, to);
            return expr;
    }
}

/**
 * @param {Lambda} expr
 * @returns {string[]}
 * @example
 * freevars(parse("(lambda (x) x y)")) // ["y"]
 */
function freevars(expr) {
    switch (expr.type) {
        case "var":
            return [expr.val.id];
        case "fun":
            return freevars(expr.val.body).filter((id) => id !== expr.val.id);
        case "apply":
            return [...freevars(expr.val.left), ...freevars(expr.val.right)];
    }
}

/**
 * @param {Lambda} expr
 * @returns {string[]}
 * @example
 * freevars(parse("(lambda (x) x y)")) // ["x"]
 */
function boundvars(expr) {
    switch (expr.type) {
        case "var":
            return [];
        case "fun":
            return [expr.val.id, ...boundvars(expr.val.body)];
        case "apply":
            return [...boundvars(expr.val.left), ...boundvars(expr.val.right)];
    }
}

/**
 * @param {Lambda} expr
 * @param {string} from
 * @param {string} to
 * @returns {Lambda}
 * @example
 * format(rename(parse("(lambda (x) x y)")), "y", "z") // (lambda (x) x z)
 * format(rename(parse("x (lambda (x) x y)")), "x", "z") // (z (lambda (x) x y))
 */
function rename(expr, from, to) {
    // console.log("REEname", format(expr));
    switch (expr.type) {
        case "var":
            return expr.val.id == from ? { type: "var", val: { id: to } } : expr;
        case "fun":
            if (expr.val.id == from) {
                expr.val.id = to;
            }
            expr.val.body = rename(expr.val.body, from, to);
            return expr;
        case "apply":
            expr.val.left = rename(expr.val.left, from, to);
            expr.val.right = rename(expr.val.right, from, to);
            return expr;
    }
}

/**
 * @param {Lambda} expr
 * @param {string} index
 * @returns {Lambda}
 */
function evalAt(expr, index) {
    switch (expr.type) {
        case "var":
            const id = expr.val.id;
            if (/^\d+$/.test(id)) {
                const n = Number(id);
                return parse(`(lambda (f x) ${"(f".repeat(n)} x ${")".repeat(n)})`);
            }
            return parse(config.env[expr.val.id]);
        case "fun":
            expr.val.body = evalAt(expr.val.body, index);
            return expr;
        case "apply":
            if (!index) {
                if (expr.val.left.type != "fun")
                    throw new Error("left side of apply isn't a function");
                /** @type {LambdaFun} */
                const l = expr.val.left;
                const rfree = freevars(expr.val.right);
                let collision = [...rfree, ...boundvars(l.val.body)];
                for (let id of boundvars(l.val.body)) {
                    if (rfree.includes(id)) {
                        let id2 = id + "'";
                        while (collision.includes(id2)) {
                            id2 += "'";
                        }
                        collision.push(id2);
                        collision.splice(collision.indexOf(id), 1);
                        l.val.body = rename(l.val.body, id, id2);
                    }
                }
                return subst(l.val.body, l.val.id, expr.val.right);
            }
            if (index[0] == "L") {
                expr.val.left = evalAt(expr.val.left, index.slice(1));
            } else {
                expr.val.right = evalAt(expr.val.right, index.slice(1));
            }
            return expr;
    }
}

function evalLast(index) {
    const last = config.history[config.history.length - 1];
    config.history.push(evalAt(parse(format(last)), index));
    show(true);
}

/**
 * @param {Lambda} expr
 * @param {string} index
 * @returns {HTMLDivElement}
 */
function toHtml(expr, index = "") {
    /** @param {HTMLDivElement} div */
    function evalme(div) {
        div.classList.add("eval");
        config.evalable.push(index);
        div.addEventListener("click", (event) => {
            event.stopPropagation();
            evalLast(index);
        });
        div.addEventListener("mouseover", (event) => {
            event.stopPropagation();
            div.classList.add("eval-hover");
        });
        div.addEventListener("mouseout", () => {
            div.classList.remove("eval-hover");
        });
    }
    let ret = document.createElement("div");
    ret.classList.add("expr", expr.type);
    switch (expr.type) {
        case "var":
            const id = expr.val.id;
            ret.innerHTML = id;
            if (/^\d+$/.test(id)) {
                evalme(ret);
            } else if (id in config.env) {
                evalme(ret);
            }
            return ret;
        case "fun":
            ret.innerHTML = `<div>λ${expr.val.id}</div>`;
            ret.append(toHtml(expr.val.body, index));
            return ret;
        case "apply":
            const l = toHtml(expr.val.left, index + "L");
            const r = toHtml(expr.val.right, index + "R");
            if (l.classList.contains("fun")) {
                evalme(ret);
            }
            ret.append(l, r);
            return ret;
    }
}

/** @param {string} str */
function newInput(str) {
    config.input.value = str;
    config.history = [parse(str)];
    show();
}

/** @param {string} str */
function newEnv(str) {
    config.envElement.value = str;
    const exprs = toSexpr(str);
    config.env = {};
    for (let i = 0; i < exprs.length; i += 2) {
        config.env[exprs[i]] = format(toLambda(exprs[i + 1]));
    }
    console.log("env", Object.keys(config.env));
}

function showLast() {
    const last = config.history[config.history.length - 1];
    config.evalable = [];
    config.output.replaceChildren(toHtml(last));
    config.output.lastChild.scrollIntoView(false);
}

function show(append = false) {
    // config.input.value = format(config.history[0]);
    if (!append) {
        config.historyElement.innerHTML = "";
    }
    let i = append ? config.history.length - 1 : 0;
    for (; i < config.history.length; i++) {
        // for (let i in config.history) {
        // why is i a string???
        const row = config.historyElement.insertRow();
        row.classList.add("pop");
        for (const f of [format, formatLambda, formatDebruijn, formatEta]) {
            const text = f(config.history[i]);
            const cell = row.insertCell();
            cell.addEventListener("click", () => {
                navigator.clipboard.writeText(text);
            });
            cell.innerHTML = text;
        }
        const i2 = i;
        row.addEventListener("click", (_) => {
            for (let j = config.history.length - 1; j > i2; j--) {
                config.historyElement.deleteRow(j);
            }
            config.history.splice(Number(i2) + 1);
            // remove splice from the table
            showLast();
        });
    }
    showLast();
}

config.input.addEventListener("input", (event) => {
    newInput(event.target.value);
});
config.envElement.addEventListener("input", (event) => {
    newEnv(event.target.value);
});

/** returns a comparator to choose between 2 strings for an evaluation strategy
 * e.g. an inner left strategy will choose L00 over L01 because it's more left
 * an inner right strategy will choose 0100 010 because it's more inner
 * @prop {Boolean} inner
 * @prop {Boolean} left
 */
function makeStrategy(inner, left) {
    return (a, b) => {
        let end = a.length < b.length ? a.length : b.length;
        for (let i = 0; i < end; i++) {
            if (a[i] !== b[i]) return left === (a[i] === "L");
        }
        return inner === a.length > end;
    };
}

/** given a comparison function, return the best item in list l */
function best(l, cmp) {
    return l.reduce((found, current) => {
        if (cmp(found, current)) return found;
        return current;
    });
}

document.addEventListener("keypress", (event) => {
    var _a;
    if (event.key === "Enter" && event.shiftKey) {
        // exit text box, without a timeout it immediately regains focus
        setTimeout(() => {
            input.blur();
        }, 30);
        return;
    }
    let strategies = {
        1: makeStrategy(true, true), // inner left
        2: makeStrategy(true, false), // inner right
        3: makeStrategy(false, true), // outer left
        4: makeStrategy(false, false), // outer right
        // TODO: outer right breaks for (3 2)
    };
    if (
        (_a = document.activeElement) === null || _a === void 0
            ? void 0
            : _a.matches("body")
    ) {
        switch (event.key) {
            case "-":
                if (config.history.length > 1) {
                    config.history.pop();
                    config.historyElement.deleteRow(-1);
                    showLast();
                }
                break;
            case "1":
            case "2":
            case "3":
            case "4":
                if (config.evalable.length == 0) {
                    return;
                }
                const index = best(config.evalable, strategies[event.key]);
                evalLast(index);
                break;
            case "0":
                config.history = [config.history[0]];
                show();
                break;
        }
    }
});

newEnv(`True (lambda (a b) a)
False (lambda (a b) b)
Not (lambda (p) (p False True))
And (lambda (p q) (p q p))
Or (lambda (p q) (p p q))
Cons (lambda (a b) (lambda (p) (p a b)))
Car (lambda (l) (l True))
Cdr (lambda (l) (l False))
Nil (lambda (p) True)
Nil? (lambda (l) (lambda (a b) False))
Zero? (lambda (n) (n (lambda (a) Ki) K))
Succ (lambda (n f x) (f (n f x)))
+ (lambda (a b) (a Succ b))
* (lambda (a b) (a (+ b) 0))
^ (lambda (b e) (e b))
Prev (lambda (n) (Car (n (lambda (p) (Cons (Cdr p) (Succ (Cdr p)))) (Cons 0 0))))
- (lambda (a b) (b Prev a))
<= (lambda (a b) (Zero? (- a b)))
>= (lambda (a b) (<= b a))
> (lambda (a b) (Not (<= a b)))
< (lambda (a b) (> b a))
Half (lambda (n) (Car (n (lambda (p) (Cons (Cdr p) (Succ (Car p)))) (Cons 0 0))))
Sum (lambda (n) (Half (* n (Succ n))))
S (lambda (a b c) ((a c) (b c)))
K (lambda (a b) a)
I (lambda (a) a)
Ki (lambda (a b) b)
M (lambda (a) (a a))
W (M M)
Y (lambda (f) ((lambda (x) (f (x x))) (lambda (x) (f (x x)))))
iota (lambda (x) (x S K))
`);
// newInput("S K K");
// newInput("(lambda (x y) x y) (y w)");
// newInput("(lambda (f) (lambda (x) (f (f x))))");
// newInput("((lambda (f) (lambda (x) x)) (lambda (f) (lambda (x) (f (f x)))))");
// newInput("(lambda (x x' x'') x' x'') x'");
// newInput("(lambda (cell) (+ (Car cell) (Cdr cell))) (Cons (^ 2 3) (+ 2 3))");
newInput("* 2 3");
// evalLast("");
