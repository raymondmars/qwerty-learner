# 单词详情数据

练习页在拼完单词、等待按 Enter 时展示的详情卡片，数据来自 `public/word-details/`。
这份文档说明数据怎么组织、如何扩充覆盖范围。

## 为什么按单词组织

雅思在本项目有 59 个变种词库，去重后 19453 个唯一单词，彼此重叠率 0%–79%。
如果按「词库 + 章节」存储，同一个词会被反复生成，而且用户换个变种词库就查不到。

改为按单词存储后，一个词只生成一次，所有词库共享，复习模式同样命中。
实际收益很直观：CET-4、CET-6、考研这三个词库从未单独生成过，仅靠共享雅思数据
就达到了 70%–77% 的覆盖率。

## 目录结构

```
public/word-details/
  words/<编码后的词>.json   单条单词详情，平均约 650 字节
  index.json               已覆盖的单词清单，前端据此判断要不要发请求
  <dictId>/<chapter>.json  早期产物，已废弃，被 .gitignore 挡住
```

只有 `words/` 和 `index.json` 入库。

### 文件名编码

单词里存在 `/ ? % & ' 空格 é` 等文件名和 URL 都不安全的字符，统一把 `[a-z0-9-]`
之外的字符编码成 `~xx`（十六进制码点）：

| 单词    | 文件名        |
| ------- | ------------- |
| `equal` | `equal.json`  |
| `A/C`   | `a~2fc.json`  |
| `it's`  | `it~27s.json` |
| `café`  | `caf~e9.json` |

因为 `~` 自身也会被编码成 `~7e`，所以解码是无歧义的，`index.json` 可以直接从
目录名反推重建。19478 个雅思词实测零碰撞。

> 这个函数在 `scripts/word-details-store.mjs` 和
> `src/pages/Typing/hooks/useWordDetail.ts` 各有一份，改动要同步。

### 单条数据的结构

```jsonc
{
  "sentences": [{ "en": "...", "zh": "..." }], // 例句，最多 3 条
  "phrases": [{ "en": "...", "zh": "..." }], // 语料统计出的高频词组
  "senses": [{ "pos": "n.", "zh": "..." }], // 释义，带词性
  "mnemonic": "词根记忆：...", // 可选
  "synonyms": ["..."], // 可选
  "antonyms": ["..."], // 可选
  "cognates": ["..."], // 可选，同根词
  "collocations": [{ "en": "...", "zh": "..." }] // 可选，词典收录的固定搭配
}
```

除 `sentences` 和 `phrases` 外都是可选字段，缺失时卡片自动省略对应小节。

## 数据来源分工

刻意做了分工，**不让模型编造英文**：

| 内容                                       | 来源                                                 |
| ------------------------------------------ | ---------------------------------------------------- |
| 例句英文                                   | Tatoeba 真人语料，按长度、标点、专有名词密度筛选     |
| 词组                                       | 从语料统计 2/3-gram 高频搭配，过滤残缺片段与语料人名 |
| 释义 / 助记 / 同义反义 / 同根词 / 固定搭配 | 本地 306 个英文词库，按单词挑最完整的一份            |
| 中文翻译、语料不足时的兜底例句             | 本机 ollama                                          |

Tatoeba 语料以 CC-BY 2.0 FR 授权，分发时需保留署名（README 的「数据来源」一节已注明）。

## 前置准备

**1. 下载 Tatoeba 语料并抽出英文行**

```bash
curl -L https://huggingface.co/datasets/loretoparisi/tatoeba-sentences/resolve/main/sentences.csv \
  | grep $'^eng\t' | cut -f2 > /tmp/tatoeba-eng.txt
```

约 61MB、158 万行。放在 `/tmp` 意味着重启后会丢失，需要时重新下载即可，
或用环境变量 `TATOEBA_ENG` 指向别处。

**2. 启动本机 ollama 并拉取模型**

```bash
ollama pull qwen2.5:14b
```

默认用 14b。7b 也能跑，但翻译质量明显偏弱——介词短语和从句容易译反，
例如把 `episodic memory` 译成「短期记忆」。可用 `OLLAMA_MODEL` 覆盖。

## 扩充覆盖范围

```bash
node scripts/gen-word-details.mjs --dict <dictId> --chapters 0-19 --concurrency 4
```

`dictId` 取自 `src/resources/dictionary.ts`。**已经有详情的词会自动跳过**，
所以跨词库重复运行不会浪费算力，中断后重跑也能续上。

词表较大时建议分批，每批 20 章左右，避免一次性为几千个词建语料索引导致内存吃紧：

```bash
for start in $(seq 0 20 126); do
  end=$((start + 19)); [ $end -gt 126 ] && end=126
  node scripts/gen-word-details.mjs --dict <dictId> --chapters ${start}-${end} --concurrency 4
done
```

生成结束后补上释义与记忆辅助：

```bash
node scripts/build-word-notes.mjs
```

按实测速率（`qwen2.5:14b`，concurrency 4），约 12 词/分钟。

### 定向重跑单个词

发现某个词的翻译有问题时，不必整章重跑：

```bash
node scripts/gen-word-details.mjs --dict ielts --words refreshment,inlet --force
```

## 脚本职责

| 脚本                     | 职责                                                    |
| ------------------------ | ------------------------------------------------------- |
| `word-details-store.mjs` | 存储层：文件名编码、读写、重建索引                      |
| `gen-word-details.mjs`   | 生成例句与词组，按单词跨词库去重                        |
| `build-word-notes.mjs`   | 从词库提取释义、助记、同义反义、同根词、固定搭配        |
| `build-word-index.mjs`   | 合并早期的「词库 + 章节」产物并重建索引，正常流程用不到 |

## 模型输出的防护

本地模型会偶尔不守格式：吐出截断的 JSON、把原文连同冒号一起回显、
甚至泄漏 prompt 模板。生成脚本对此有三层防护：

1. JSON 解析失败时降温重试一次，仍失败则降级，不会打挂整批
2. 含 prompt 泄漏、JSON 片段或没有中文的译文**直接丢弃该条**，宁可少一条也不要错的
3. 兜底生成的句子必须通过词形校验，确认确实包含目标词的某个变形

## 已知限制

- **语义错译无法自动检测。** 格式问题已全部拦截，但「格式正确、意思译反」这类
  错误只能靠人发现，用 `--words` 定向重跑修正。
- **多词条目跑不出例句。** 词库里的短语条目（`take one's temperature`）和拼写变体
  条目（`fibre/fiber`）在语料中匹配不到，兜底生成也过不了词形校验。占比约 0.2%–0.3%。
- **词组只在语料频次达标时才有。** 低频词常常只有例句、没有词组，这是预期行为。

## 前端读取方式

`src/pages/Typing/hooks/useWordDetail.ts`：

- 索引整站只拉一次并长期缓存，用来判断某个词要不要发请求
- 章节加载时并行预取本章 20 个词的详情，等用户拼完时数据已就绪
- **没有覆盖数据的词库一个请求都不会发**，不会产生 404 噪音
