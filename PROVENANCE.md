# 来源与第三方授权说明

微主题、先修关系图，以及 Marble 撰写的所有文本，均为原创作品，以 ODbL 1.0 +
CC BY-SA 4.0 授权发布（详见 [README](README.md#许可证)）。

**`data/curriculum-standards.json` 则不同。** 这些标准提取自 Marble **不拥有**、也**无权重新授权**
的外部课标框架。我们能授予你的，仅限于其上游权利人所授予的权利。每一来源的具体条款——
以及我们实际随附了什么——如下所示。

## "仅代码"的区分

对于存在授权负担的来源，我们**只随附标准代码**（例如 `1-ESS1-1`）及其键——这是一种简短的
**事实性标识**，版权风险很低——而**省略逐字的标准原文**（`description`、`clarificationStatement` 等）。
`topics.json` 中的 主题→标准 *链接* 不受影响，因此"本主题对应标准 X"这一关系在全数据集内始终保留。
在 `curriculum-standards.json` 中标记为 `textIncluded: false` 的来源，即为"仅代码"来源。

## 各来源条款

### 🟢 `uk-nc-2013` —— 英格兰国家课程（关键阶段 1–2）—— **全文**

- **出版方 / 权利方：** 英国教育部（UK Department for Education）。© 英国皇家版权（Crown copyright）。
- **许可证：** [开放政府许可证 v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)。允许商业使用、改编与再分发。**无相同方式共享要求。**
- **须附声明：** *"本产品包含依据《开放政府许可证 v3.0》授权的公共部门信息。"*
- **我们随附：** 标准全文。

### 🟡 `ccss-ela`、`ccss-math` —— 共同核心州立标准（Common Core State Standards）—— **全文**

- **出版方 / 权利方：** © 2010 全国州长协会最佳实践中心（NGA Center）与首席州立学校官员理事会（CCSSO）。
- **许可证：** CCSS 公共许可证授予*"一项有限的、非独占的、免特许权使用费的权利，用以复制、出版、分发并展示共同核心州立标准，
  用于支持共同核心州立标准倡议之目的。"* 该授权**以用途为限**，且并未明确授予衍生作品权或再授权权——
  因此源自 CCSS 的记录仍归 CCSS 公共许可证管辖，**而非** ODbL。
- **须附声明：** *"© 2010 全国州长协会最佳实践中心与首席州立学校官员理事会版权所有。"*
- **我们随附：** 标准全文，依 CCSS 公共许可证。

### 🔴 `ngss-k5`、`ngss-ms` —— 新一代科学标准（Next Generation Science Standards）—— **仅代码**

- **出版方 / 权利方：** 版权归美国国家学院出版社（National Academies Press）。*"NGSS"* 与
  *"Next Generation Science Standards"* 是 **WestEd 的注册商标**。
- **许可证：** 非商业实体可自由复制/改编。**[商业](https://www.nationalacademies.org/)实体使用这些标准则受限**——
  包括须提交样稿供审批，以及强制性的商标免责声明。不可依 ODbL 再授权。
- **须附声明（若引用 NGSS）：** *"NGSS 是 WestEd 的注册商标。无论是 WestEd，还是制定新一代科学标准的牵头州及合作方，
  均未参与本产品的制作，亦不对其背书。"*
- **我们随附：** 仅代码/键（省略逐字原文）。如需纳入 NGSS 全文，须先取得 WestEd 的授权。

### 🔴 `c3-social-studies` —— C3 社会 studies 框架（C3 Framework for Social Studies）—— **仅代码**

- **出版方 / 权利方：** © 全美社会 studies 理事会（National Council for the Social Studies, NCSS）。
- **许可证：** 基于许可；再分发框架原文须取得 NCSS 许可。
- **我们随附：** 仅代码/键。在随附全文前，须先取得 NCSS 许可。

### 🔴 `ib-pyp-pspe` —— IB PYP 个人、社会与体育教育 范围与顺序（IB PYP Personal, Social & Physical Education Scope & Sequence）—— **仅代码**

- **出版方 / 权利方：** © 国际文凭组织（International Baccalaureate Organization, IBO）。
- **许可证：** IB 内容受版权保护，IBO 对其保护极为严格；再分发须取得 IB 明确许可。这是限制最严的来源。
- **我们随附：** 仅代码/键。在未取得 IB 许可前，不得随附全文。

## 如何更改随附内容

导出工具提供按来源开关。若已厘清权利、想（重新）纳入某来源的全文，可在"仅代码"集合中去掉该 slug 后重新生成：

```bash
# 逐字随附全部内容
DATABASE_URL=… node exportTaxonomy.mjs --codes-only=

# 默认（存在授权负担的来源仅随附代码）
DATABASE_URL=… node exportTaxonomy.mjs
```

### 🟡 `cn-math-2022` —— 义务教育数学课程标准（2022年版）· 小学部分 —— **仅编码 + 自写转述**

- **出版方 / 权利方：** 中华人民共和国教育部，2022 年 4 月以《教育部关于印发义务教育课程方案和课程标准（2022年版）的通知》（教材〔2022〕2号）发布；[通知与 PDF 全文](http://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html)。
- **许可状况：不确定。** 《著作权法》第五条不保护"具有立法、行政、司法性质的文件"，但课程标准是否属于此类没有定论，正式出版物另有出版社的版式权利。在得到明确答复之前，本项目按保守方式处理。
- **我们随附：** 本项目自定的编码、自写的中文转述（`summary`）、学段 / 领域 / 主题归属以及课标印刷页码（`page`），不收课标原文。转述与编码随本数据集其余文本一起以 CC BY-SA 4.0 发布。
- **编码说明：** `S1.NA.SY.01` 这类编码不是教育部官方编号，只是为了引用方便而自定的；序号对应课标【内容要求】中的 (1)(2)…。
- **对齐记录**（`data/alignments/cn-math-2022.json`）是本项目的原创内容，由 Claude 依据课标逐条起草（`review: llm-draft`），尚未经教师审校，使用前请自行核对。

