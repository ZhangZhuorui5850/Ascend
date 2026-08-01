const LICENSE = Object.freeze({
  id: "CC0-1.0",
  origin: "Ascend original",
  redistribution: true,
});

function numbers(input) {
  return input.trim().split(/\s+/).filter(Boolean).map(Number);
}

function bigints(input) {
  return input.trim().split(/\s+/).filter(Boolean).map(BigInt);
}

function lines(input) {
  return input.replace(/\r/g, "").split("\n");
}

function output(value) {
  return `${String(value).replace(/\n+$/, "")}\n`;
}

function fixture(ref, solve, publicInputs, hiddenInputs) {
  return {
    ref,
    license: LICENSE,
    languages: ["cpp17", "python3"],
    timeLimitMs: 1_000,
    memoryLimitKb: 131_072,
    cases: [
      ...publicInputs.map((input) => ({ visibility: "public", input, output: output(solve(input)) })),
      ...hiddenInputs.map((input) => ({ visibility: "hidden", input, output: output(solve(input)) })),
    ],
  };
}

const solvers = {
  sumTwo(input) {
    const [a, b] = bigints(input);
    return a + b;
  },
  rangeSum(input) {
    const [left, right] = bigints(input);
    const count = right - left + 1n;
    return (left + right) * count / 2n;
  },
  parity(input) {
    return bigints(input)[0] % 2n === 0n ? "EVEN" : "ODD";
  },
  maxThree(input) {
    return bigints(input).reduce((best, value) => value > best ? value : best);
  },
  leapYear(input) {
    const year = numbers(input)[0];
    return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0) ? "YES" : "NO";
  },
  digitSum(input) {
    return [...input.trim().replace(/^-/, "")]
      .reduce((sum, character) => sum + Number(character), 0);
  },
  countPositive(input) {
    const values = numbers(input);
    return values.slice(1, values[0] + 1).filter((value) => value > 0).length;
  },
  arrayMinMax(input) {
    const values = bigints(input);
    const data = values.slice(1, Number(values[0]) + 1);
    let minimum = data[0];
    let maximum = data[0];
    for (const value of data) {
      if (value < minimum) minimum = value;
      if (value > maximum) maximum = value;
    }
    return `${minimum} ${maximum}`;
  },
  reverseArray(input) {
    const values = bigints(input);
    return values.slice(1, Number(values[0]) + 1).reverse().join(" ");
  },
  secondLargest(input) {
    const values = [...new Set(bigints(input).slice(1).map(String))].map(BigInt);
    values.sort((a, b) => a < b ? 1 : a > b ? -1 : 0);
    return values[1];
  },
  longestIncreasingRun(input) {
    const values = bigints(input);
    const data = values.slice(1, Number(values[0]) + 1);
    let current = 1;
    let best = 1;
    for (let index = 1; index < data.length; index += 1) {
      current = data[index] > data[index - 1] ? current + 1 : 1;
      best = Math.max(best, current);
    }
    return best;
  },
  palindrome(input) {
    const value = input.trim();
    return value === [...value].reverse().join("") ? "YES" : "NO";
  },
  charFrequency(input) {
    const [value = "", target = ""] = lines(input);
    return [...value].filter((character) => character === target.trim()).length;
  },
  balancedBrackets(input) {
    const stack = [];
    const pairs = { ")": "(", "]": "[", "}": "{" };
    for (const character of input.trim()) {
      if ("([{".includes(character)) stack.push(character);
      else if (stack.pop() !== pairs[character]) return "NO";
    }
    return stack.length === 0 ? "YES" : "NO";
  },
  runLengthEncode(input) {
    const value = input.trim();
    let result = "";
    let count = 0;
    for (let index = 0; index < value.length; index += 1) {
      count += 1;
      if (value[index] !== value[index + 1]) {
        result += `${value[index]}${count}`;
        count = 0;
      }
    }
    return result;
  },
  wordCount(input) {
    const value = lines(input)[0]?.trim() || "";
    return value ? value.split(/ +/).length : 0;
  },
  lowerBound(input) {
    const values = bigints(input);
    const n = Number(values[0]);
    const target = values[1];
    const data = values.slice(2, n + 2);
    let left = 0;
    let right = n;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      if (data[middle] >= target) right = middle;
      else left = middle + 1;
    }
    return left === n ? -1 : left;
  },
  mergeSorted(input) {
    const values = bigints(input);
    const n = Number(values[0]);
    const m = Number(values[1]);
    const first = values.slice(2, 2 + n);
    const second = values.slice(2 + n, 2 + n + m);
    const result = [];
    let left = 0;
    let right = 0;
    while (left < n || right < m) {
      if (right >= m || (left < n && first[left] <= second[right])) result.push(first[left++]);
      else result.push(second[right++]);
    }
    return result.join(" ");
  },
  uniqueSorted(input) {
    const values = bigints(input);
    const data = values.slice(1, Number(values[0]) + 1);
    return data.filter((value, index) => index === 0 || value !== data[index - 1]).join(" ");
  },
  twoSumSorted(input) {
    const values = bigints(input);
    const n = Number(values[0]);
    const target = values[1];
    const data = values.slice(2, n + 2);
    let left = 0;
    let right = n - 1;
    while (left < right) {
      const sum = data[left] + data[right];
      if (sum === target) return `${left} ${right}`;
      if (sum < target) left += 1;
      else right -= 1;
    }
    return "-1 -1";
  },
  rotateRight(input) {
    const values = bigints(input);
    const n = Number(values[0]);
    const shift = Number(values[1] % BigInt(n));
    const data = values.slice(2, n + 2);
    return [...data.slice(n - shift), ...data.slice(0, n - shift)].join(" ");
  },
  prefixRangeQuery(input) {
    const values = bigints(input);
    const n = Number(values[0]);
    const queryCount = Number(values[1]);
    const data = values.slice(2, 2 + n);
    const prefix = [0n];
    for (const value of data) prefix.push(prefix[prefix.length - 1] + value);
    const result = [];
    let cursor = 2 + n;
    for (let query = 0; query < queryCount; query += 1) {
      const left = Number(values[cursor++]);
      const right = Number(values[cursor++]);
      result.push(prefix[right + 1] - prefix[left]);
    }
    return result.join("\n");
  },
  maxSubarray(input) {
    const values = bigints(input);
    const data = values.slice(1, Number(values[0]) + 1);
    let current = data[0];
    let best = data[0];
    for (let index = 1; index < data.length; index += 1) {
      current = data[index] > current + data[index] ? data[index] : current + data[index];
      if (current > best) best = current;
    }
    return best;
  },
  intervalMergeCount(input) {
    const values = bigints(input);
    const n = Number(values[0]);
    const intervals = Array.from({ length: n }, (_, index) => [
      values[1 + index * 2],
      values[2 + index * 2],
    ]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    let count = 0;
    let right = null;
    for (const [left, nextRight] of intervals) {
      if (right === null || left > right) {
        count += 1;
        right = nextRight;
      } else if (nextRight > right) {
        right = nextRight;
      }
    }
    return count;
  },
  gridShortestPath(input) {
    const rows = lines(input);
    const [height, width] = rows[0].trim().split(/\s+/).map(Number);
    const grid = rows.slice(1, height + 1);
    let start = null;
    let target = null;
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        if (grid[row][column] === "S") start = [row, column];
        if (grid[row][column] === "T") target = [row, column];
      }
    }
    const queue = [[...start, 0]];
    const visited = new Set([`${start[0]}:${start[1]}`]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const [row, column, distance] = queue[cursor];
      if (row === target[0] && column === target[1]) return distance;
      for (const [rowDelta, columnDelta] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nextRow = row + rowDelta;
        const nextColumn = column + columnDelta;
        const key = `${nextRow}:${nextColumn}`;
        if (
          nextRow >= 0 && nextRow < height
          && nextColumn >= 0 && nextColumn < width
          && grid[nextRow][nextColumn] !== "#"
          && !visited.has(key)
        ) {
          visited.add(key);
          queue.push([nextRow, nextColumn, distance + 1]);
        }
      }
    }
    return -1;
  },
  gcdLcm(input) {
    const [originalA, originalB] = bigints(input);
    let a = originalA;
    let b = originalB;
    while (b !== 0n) [a, b] = [b, a % b];
    return `${a} ${originalA / a * originalB}`;
  },
  coinChangeMin(input) {
    const values = numbers(input);
    const n = values[0];
    const amount = values[1];
    const coins = values.slice(2, n + 2);
    const dp = Array(amount + 1).fill(Number.POSITIVE_INFINITY);
    dp[0] = 0;
    for (let current = 1; current <= amount; current += 1) {
      for (const coin of coins) {
        if (current >= coin) dp[current] = Math.min(dp[current], dp[current - coin] + 1);
      }
    }
    return Number.isFinite(dp[amount]) ? dp[amount] : -1;
  },
  lisLength(input) {
    const values = bigints(input);
    const data = values.slice(1, Number(values[0]) + 1);
    const tails = [];
    for (const value of data) {
      let left = 0;
      let right = tails.length;
      while (left < right) {
        const middle = Math.floor((left + right) / 2);
        if (tails[middle] >= value) right = middle;
        else left = middle + 1;
      }
      tails[left] = value;
    }
    return tails.length;
  },
  knapsack01(input) {
    const values = numbers(input);
    const n = values[0];
    const capacity = values[1];
    const weights = values.slice(2, 2 + n);
    const prices = values.slice(2 + n, 2 + n + n);
    const dp = Array(capacity + 1).fill(0);
    for (let index = 0; index < n; index += 1) {
      for (let current = capacity; current >= weights[index]; current -= 1) {
        dp[current] = Math.max(dp[current], dp[current - weights[index]] + prices[index]);
      }
    }
    return dp[capacity];
  },
  connectedComponents(input) {
    const values = numbers(input);
    const n = values[0];
    const m = values[1];
    const adjacency = Array.from({ length: n }, () => []);
    for (let index = 0; index < m; index += 1) {
      const left = values[2 + index * 2] - 1;
      const right = values[3 + index * 2] - 1;
      adjacency[left].push(right);
      adjacency[right].push(left);
    }
    const visited = Array(n).fill(false);
    let components = 0;
    for (let start = 0; start < n; start += 1) {
      if (visited[start]) continue;
      components += 1;
      const stack = [start];
      visited[start] = true;
      while (stack.length) {
        const current = stack.pop();
        for (const next of adjacency[current]) {
          if (!visited[next]) {
            visited[next] = true;
            stack.push(next);
          }
        }
      }
    }
    return components;
  },
};

export function buildJudgeProblemDefinitions() {
  return [
    fixture("ascend:foundation:sum-two:v1", solvers.sumTwo,
      ["1 2\n", "-7 5\n"],
      ["0 0\n", "1000000000000 -999999999999\n", "-10 -20\n", "922337203685477000 1\n"]),
    fixture("ascend:foundation:range-sum:v1", solvers.rangeSum,
      ["1 5\n", "-2 2\n"],
      ["7 7\n", "-1000000000 1000000000\n", "999999999 1000000000\n", "-5 -1\n"]),
    fixture("ascend:foundation:parity-label:v1", solvers.parity,
      ["-3\n", "8\n"],
      ["0\n", "-8\n", "999999999999999999\n", "-999999999999999998\n"]),
    fixture("ascend:foundation:max-three:v1", solvers.maxThree,
      ["3 9 4\n", "-5 -2 -7\n"],
      ["0 0 0\n", "7 7 3\n", "-9 -9 -10\n", "1000000000000 -1 999999999999\n"]),
    fixture("ascend:foundation:leap-year:v1", solvers.leapYear,
      ["2000\n", "1900\n"],
      ["2024\n", "2100\n", "2400\n", "1\n"]),
    fixture("ascend:foundation:digit-sum:v1", solvers.digitSum,
      ["50203\n", "-900\n"],
      ["0\n", "999999999999999999\n", "-123456789\n", "1000000000000000000\n"]),
    fixture("ascend:foundation:count-positive:v1", solvers.countPositive,
      ["5\n-1 0 2 3 -4\n", "1\n0\n"],
      ["4\n1 2 3 4\n", "4\n-1 -2 -3 -4\n", "6\n0 5 0 -2 9 -1\n", "1\n7\n"]),
    fixture("ascend:foundation:array-minmax:v1", solvers.arrayMinMax,
      ["5\n3 -2 9 9 0\n", "1\n7\n"],
      ["4\n5 5 5 5\n", "3\n-9 -2 -7\n", "2\n-1000000000000 1000000000000\n", "5\n0 -1 1 -1 0\n"]),
    fixture("ascend:foundation:reverse-array:v1", solvers.reverseArray,
      ["5\n1 2 3 4 5\n", "1\n-7\n"],
      ["4\n0 0 1 0\n", "3\n-1 -2 -3\n", "6\n9 8 7 6 5 4\n", "2\n1000000000000 -1000000000000\n"]),
    fixture("ascend:foundation:second-largest:v1", solvers.secondLargest,
      ["6\n4 1 4 3 2 3\n", "3\n-5 -2 -3\n"],
      ["2\n1 2\n", "5\n9 9 8 8 7\n", "4\n-1 -1 -2 -3\n", "6\n0 5 1 5 4 4\n"]),
    fixture("ascend:foundation:longest-increasing-run:v1", solvers.longestIncreasingRun,
      ["7\n1 2 3 2 3 4 5\n", "5\n5 4 3 2 1\n"],
      ["1\n8\n", "5\n1 2 3 4 5\n", "5\n2 2 2 2 2\n", "8\n-3 -2 -1 -4 -3 0 1 2\n"]),
    fixture("ascend:foundation:palindrome:v1", solvers.palindrome,
      ["level\n", "algorithm\n"],
      ["a\n", "abba\n", "abca\n", "zzxyxzz\n"]),
    fixture("ascend:foundation:char-frequency:v1", solvers.charFrequency,
      ["banana\na\n", "xyz\nq\n"],
      ["aaaa\na\n", "abcabcabc\nc\n", "z\nz\n", "mississippi\ns\n"]),
    fixture("ascend:foundation:balanced-brackets:v1", solvers.balancedBrackets,
      ["([]{})\n", "([)]\n"],
      ["()\n", "((()))\n", "(()\n", "]\n"]),
    fixture("ascend:foundation:run-length-encode:v1", solvers.runLengthEncode,
      ["aaabbc\n", "z\n"],
      ["aaaaaa\n", "abcdef\n", "aabbaa\n", "xxxyzzzzzz\n"]),
    fixture("ascend:foundation:word-count:v1", solvers.wordCount,
      ["  learn   algorithms well  \n", "\n"],
      ["one\n", "a b c d\n", "   padded\n", "two  spaces   groups\n"]),
    fixture("ascend:standard:lower-bound:v1", solvers.lowerBound,
      ["5 4\n1 2 4 4 7\n", "4 3\n1 2 5 9\n"],
      ["4 -5\n-2 0 3 8\n", "3 10\n1 4 9\n", "5 2\n2 2 2 3 4\n", "1 7\n7\n"]),
    fixture("ascend:foundation:merge-sorted:v1", solvers.mergeSorted,
      ["3 4\n1 4 9\n2 2 8 10\n", "0 3\n\n1 2 3\n"],
      ["3 0\n-2 0 5\n\n", "1 1\n4\n4\n", "3 3\n-5 -1 9\n-4 0 8\n", "2 4\n1 10\n2 3 4 5\n"]),
    fixture("ascend:foundation:unique-sorted:v1", solvers.uniqueSorted,
      ["7\n1 1 2 2 2 5 5\n", "3\n-1 0 1\n"],
      ["1\n8\n", "5\n4 4 4 4 4\n", "6\n-3 -3 -1 0 0 2\n", "4\n1 2 3 4\n"]),
    fixture("ascend:standard:two-sum-sorted:v1", solvers.twoSumSorted,
      ["5 9\n1 2 4 7 11\n", "4 20\n1 3 6 10\n"],
      ["2 3\n1 2\n", "5 0\n-5 -2 0 2 9\n", "6 10\n1 2 3 7 8 9\n", "4 -7\n-10 -3 1 8\n"]),
    fixture("ascend:foundation:rotate-right:v1", solvers.rotateRight,
      ["5 2\n1 2 3 4 5\n", "4 6\n1 2 3 4\n"],
      ["1 100\n9\n", "3 0\n1 2 3\n", "3 3\n-1 0 1\n", "6 11\n1 2 3 4 5 6\n"]),
    fixture("ascend:standard:prefix-range-query:v1", solvers.prefixRangeQuery,
      ["5 3\n2 -1 4 3 6\n0 2\n1 3\n4 4\n", "3 1\n10 20 30\n0 2\n"],
      ["1 2\n-7\n0 0\n0 0\n", "4 2\n1 1 1 1\n0 0\n1 2\n", "5 2\n-5 -4 -3 -2 -1\n0 4\n2 3\n", "3 3\n1000000000 1000000000 1000000000\n0 1\n1 2\n0 2\n"]),
    fixture("ascend:standard:max-subarray:v1", solvers.maxSubarray,
      ["8\n-2 1 -3 4 -1 2 1 -5\n", "3\n-5 -2 -8\n"],
      ["1\n7\n", "5\n1 2 3 4 5\n", "6\n0 -1 0 -2 0 -3\n", "7\n5 -10 6 7 -20 8 9\n"]),
    fixture("ascend:standard:interval-merge-count:v1", solvers.intervalMergeCount,
      ["4\n1 3\n2 5\n8 10\n10 12\n", "3\n-5 -4\n0 1\n7 9\n"],
      ["1\n0 0\n", "4\n1 10\n2 3\n4 5\n6 7\n", "3\n5 8\n1 2\n2 5\n", "5\n-10 -5\n-6 0\n1 1\n2 3\n3 4\n"]),
    fixture("ascend:standard:grid-shortest-path:v1", solvers.gridShortestPath,
      ["3 4\nS..#\n.#..\n...T\n", "2 3\nS#T\n###\n"],
      ["1 2\nST\n", "3 3\nS..\n...\n..T\n", "4 4\nS###\n...#\n.#.#\n.#.T\n", "3 5\nS#...\n.#.#T\n.....\n"]),
    fixture("ascend:standard:gcd-lcm:v1", solvers.gcdLcm,
      ["12 18\n", "0 7\n"],
      ["1 1\n", "17 13\n", "1000000000 500000000\n", "270 192\n"]),
    fixture("ascend:standard:coin-change-min:v1", solvers.coinChangeMin,
      ["3 11\n1 5 7\n", "2 3\n2 4\n"],
      ["1 0\n7\n", "3 6\n2 3 4\n", "3 15\n4 6 9\n", "4 27\n2 5 10 20\n"]),
    fixture("ascend:standard:lis-length:v1", solvers.lisLength,
      ["8\n10 9 2 5 3 7 101 18\n", "4\n2 2 2 2\n"],
      ["1\n5\n", "5\n1 2 3 4 5\n", "5\n5 4 3 2 1\n", "8\n-1 3 2 4 0 5 5 6\n"]),
    fixture("ascend:standard:knapsack-01:v1", solvers.knapsack01,
      ["3 5\n2 3 4\n3 4 5\n", "2 0\n1 2\n10 20\n"],
      ["1 3\n3\n9\n", "3 4\n5 6 7\n10 11 12\n", "4 7\n1 3 4 5\n1 4 5 7\n", "3 6\n2 2 2\n3 4 5\n"]),
    fixture("ascend:standard:connected-components:v1", solvers.connectedComponents,
      ["5 3\n1 2\n2 3\n4 5\n", "4 0\n"],
      ["1 0\n", "4 3\n1 2\n2 3\n3 4\n", "6 3\n1 2\n3 4\n5 6\n", "5 5\n1 2\n2 3\n3 1\n4 5\n3 4\n"]),
  ];
}

export function validateFixtureDefinitions(definitions) {
  if (definitions.length !== 30) throw new Error(`Expected 30 problems, received ${definitions.length}`);
  const refs = new Set();
  for (const problem of definitions) {
    if (refs.has(problem.ref)) throw new Error(`Duplicate fixture ref: ${problem.ref}`);
    refs.add(problem.ref);
    if (problem.cases.length < 6) throw new Error(`${problem.ref} needs at least 6 cases`);
    if (problem.cases.filter((item) => item.visibility === "public").length < 2) {
      throw new Error(`${problem.ref} needs at least 2 public cases`);
    }
    if (problem.cases.some((item) => !item.output.endsWith("\n"))) {
      throw new Error(`${problem.ref} contains a non-normalized output`);
    }
  }
  return definitions;
}
