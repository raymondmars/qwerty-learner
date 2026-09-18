# qwerty-learner

打字练习式背单词工具。React + Vite + TypeScript + Tailwind，状态用 jotai，本地数据用 Dexie（IndexedDB）。

## 最重要的一条：功能优化以认知心理学为依据

这个 app 的唯一目的是让人记住单词。**任何功能改动都要先说清它作用于哪条记忆机制**（检索练习、间隔效应、生成效应、双通道编码、认知负荷等），再谈实现。不要凭产品直觉或视觉喜好改动打字流程。

反过来也成立：看起来「更顺手、更好看」的改动可能正在削弱记忆效果——典型的是把检索难度抹平（例如在用户开始拼写前就把答案的语音或拼写送到眼前）。

已经评估过并**明确否决**的方向，不要再提：

- 靠字体大小或难读字体提升记忆。disfluency 假说（Diemand-Yauman 2011）在大规模重复实验里没能复现，把字体改小改难只会让眼睛累。
- 改按键音。机械咔哒声是非言语音，对语音工作记忆的干扰很小（Baddeley 的无关言语效应针对的是类语音声音），而它的动作反馈对打字流畅性有实际价值。

当前训练的核心是 **看中文 → 盲拼英文**（默写模式默认 `hideAll`，中文释义常驻可见），这是线索回忆，是全 app 最有价值的设计，不要动摇它。

仍未实施、但已论证成立的方向：

- **章末自动重测错词和慢词**（session 内扩展性检索，Landauer & Bjork）
- **真正的间隔重复调度器**。`WordRecord` 已经存了 `timeStamp / timing[] / wrongCount / mistakes`，其中逐字母的 `timing` 能算出检索延迟，是比正确率更灵敏的记忆强度指标；但 `ReviewRecord` 没有任何调度字段（无间隔、无 ease factor、无到期日），所谓「复习模式」只是按错误次数和最近错误时间排序的一次性清单。这是记忆效果上最大的缺口，但会改变产品形态，需要先和 Raymond 确认。

## 数据链路

词库是 `public/dicts/*.json`，条目形如 `{ name, trans: string[], usphone, ukphone }`；
单词详情（例句/词组/释义/助记）是 `public/word-details/words/<编码后的词>.json`，按**单词**存而不是按词库存，`index.json` 是已覆盖单词的清单，前端据此决定要不要发请求。

脚本都在 `scripts/`，全部幂等：

| 脚本                       | 作用                                                        | 前置条件                             |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------ |
| `build-nz-year9-dict.mjs`  | 由 `scripts/data/nz-year9-vocabulary.json` 生成 Year 9 词库 | 无                                   |
| `build-nz-k12-dicts.mjs`   | 由 COCA 词频表切出 Year 10 词库                             | 无                                   |
| `gen-word-details.mjs`     | 生成例句和词组                                              | 本机 ollama + Tatoeba 语料，见文件头 |
| `build-word-notes.mjs`     | 从词库提取释义/助记/同义反义/搭配，补进详情                 | 详情文件已存在                       |
| `normalise-dict-trans.mjs` | 统一全部中文词库的释义格式                                  | 无                                   |

**注意脚本之间的隐式依赖**：`normalise-dict-trans.mjs` 会把 `【记忆】【搭配】` 这类标注块从释义里剥掉，而 `build-word-notes.mjs` 正是靠它们产出助记和固定搭配。所以归一化脚本在剥之前会先把标注块原样存进 `scripts/data/dict-annotations.json`，`build-word-notes.mjs` 同时从词库和这个侧文件取数据。改动任何一边都要同步另一边，否则助记会静默归零。

## 约定

- 发音走有道 `dict.youdao.com/dictvoice`。免费替代方案已全部评估并否决，不要再提议更换。
- 新增词库后在 `src/resources/dictionary.ts` 里登记，`length` 必须和 json 的条目数一致（章节数由它算出来）。
- 释义主体是英文的词库（`4000_Essential_English_Words`、`SATen`、`word_roots1` 等）是有意为之，任何「统一成中文」的处理都必须排除它们。
- 部署：`make deploy`（构建后 rsync 到服务器，带 `--delete`）。拿不准先跑 `make deploy-dry`。
