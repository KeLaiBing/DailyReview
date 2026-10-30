# 点评与勋章设计参考

- [achievements-engine](https://github.com/dave-b-b/achievements-engine)：MIT。参考事件触发、幂等去重及成就条件的组织方式。本项目按文档/日期唯一记录实现，不引入额外状态引擎。
- [Trophy UI](https://github.com/trophyso/ui)：MIT。参考已解锁/待解锁的勋章收集展示。本项目保持原生 JavaScript/CSS，不为此引入 React/shadcn。

以上为设计参考，未复制第三方源码或图标。日期分段提取复用本项目已有实现；勋章使用文字字符与 CSS。模型按照明确评分标尺生成评分和证据，程序只校验与累计，不根据字数或关键词代替模型判断质量。
