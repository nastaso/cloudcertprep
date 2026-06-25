---
title: 'What Counts as a Generative AI Task?'
slug: what-counts-as-a-generative-ai-task
description: 'Which tasks are generative AI tasks and which are not? A clear guide with examples for the AWS AI Practitioner (AIF-C01) exam, with a decision table.'
date: 2026-06-25
tags: ['aif-c01', 'generative-ai', 'study-tips']
ogImage: /og/og-blog.png
draft: true
faq:
  - q: "What would be an appropriate task for using generative AI?"
    a: "Appropriate tasks are ones that create new content or language: drafting text, summarizing documents, generating images or code, answering questions, and translating. Generative AI fits when the goal is to produce something new from a prompt. It is a poor fit for exact calculations, deterministic rules, or tasks needing guaranteed correctness."
  - q: "Which tasks are not generative AI tasks?"
    a: "Classification, forecasting, fraud detection, recommendation, and anomaly detection are predictive or analytical AI, not generative. They label, score, or predict from existing data rather than create new content. If the output is a category, a number, or a ranking rather than new text, image, or code, it is not generative AI."
  - q: "Is ChatGPT generative AI?"
    a: "Yes. ChatGPT is a generative AI application built on a large language model, a type of foundation model. It generates new text in response to prompts, which is the defining trait of generative AI. The same category includes image, code, and audio generators built on foundation models."
  - q: "When is generative AI the wrong tool?"
    a: "Avoid generative AI when you need exact, repeatable answers, strict rules, or guaranteed accuracy, since it can hallucinate and is not deterministic. Tasks like billing calculations, compliance checks, or precise numeric forecasting suit traditional logic or predictive models. Use generative AI to draft and assist, not to be the source of truth."
---

A task is a generative AI task when its output is new content produced from a prompt: text, images, audio, code, or a summary. The defining trait is generation, creating something that did not exist before, rather than labeling, scoring, or predicting from existing data. If a prompt goes in and new content comes out, it is generative AI.

Telling generative tasks apart from ordinary AI tasks is one of the most common question patterns on the AWS Certified AI Practitioner (AIF-C01) exam. This guide gives you a single rule that settles almost every case, a decision table of worked examples, and the situations where generative AI is the wrong tool.

_Last reviewed: June 2026._

## What makes a task a generative AI task?

A task is a generative AI task when its output is new content produced from a prompt, such as text, images, code, audio, or a summary. The defining trait is generation: creating something that did not exist, rather than labeling, scoring, or predicting from existing data. If it produces new content, it is generative.

The mechanism behind that is a foundation model, a large model pre-trained on broad data and adapted at the moment you prompt it. You describe what you want, and the model produces a fresh response token by token. That is why the same system can draft an email, write code, and summarize a contract: each is the same underlying act of generation, just with a different prompt. This is the heart of the [Fundamentals of Generative AI](/aws/aif-c01/fundamentals-of-generative-ai) domain, which is 24% of the AIF-C01 exam.

## How are generative AI tasks different from other AI tasks?

Generative AI produces new content; predictive and analytical AI produce labels, numbers, or rankings. Writing a product description is generative; classifying a review as positive or negative is not. Summarizing a contract is generative; forecasting next month's sales is not. The output type, new content versus a decision, is the test you apply.

Run any task through one question: does the output exist already in some form, or does the model create it? If the answer is a category, a score, a forecast, or a ranking, you are looking at traditional, predictive machine learning, the [fundamentals of AI and ML](/aws/aif-c01/fundamentals-of-ai-and-ml) that domain 1 of the exam covers. If the answer is new text, an image, audio, or code, it is generative AI. The table below applies that test to common tasks.

| Task | Generative AI? | Why |
| --- | --- | --- |
| Draft a marketing email | Yes | Produces new text from a prompt |
| Classify a support ticket by topic | No | Assigns an existing label (classification) |
| Summarize a long report | Yes | Generates new, shorter text |
| Forecast next quarter's demand | No | Predicts a number from historical data |
| Generate or explain code | Yes | Produces new code or an explanation |
| Detect a fraudulent transaction | No | Scores and flags an outlier (anomaly detection) |
| Translate a document | Yes | Generates equivalent text in another language |
| Recommend a product to a shopper | No | Ranks items that already exist |

Notice that classification, forecasting, fraud detection, and recommendation all read existing data and return a decision about it. None of them invents new content, so none is generative, even when they use sophisticated models.

## What are common generative AI use cases?

Typical generative AI tasks include drafting and rewriting text, summarizing long documents, answering questions in natural language, translating, generating or editing images, and producing or explaining code. They share one pattern: a prompt in, new content out. For AIF-C01, recognizing that pattern is usually enough to classify a task correctly.

On AWS these use cases are built by sending a prompt to a managed foundation model rather than training your own. A customer-support assistant that drafts replies, a tool that turns release notes into a summary, and a feature that generates product images are all the same shape underneath. The [Applications of Foundation Models](/aws/aif-c01/applications-of-foundation-models) domain, 28% of the exam and the single largest, is where these patterns are tested in scenario form.

## When is generative AI the wrong tool?

Generative AI is the wrong choice when you need exact, deterministic, or guaranteed-correct results, because it can hallucinate and varies between runs. Numeric forecasting, rules-based compliance, and precise calculations belong to traditional logic or predictive models. Use generative AI to assist and draft, with human review, not as a source of guaranteed truth.

Two limits drive this. First, a generative model is probabilistic, so the same prompt can give different answers and confident-sounding output can be wrong. Second, its quality depends on data: gaps, bias, or stale information in the training or retrieval data show up directly in what it generates. When a task needs a single correct answer every time, a billing calculation or a compliance check, reach for deterministic logic or a predictive model and keep generative AI for the drafting and assistance around it. Knowing these limits, and the guardrails that manage them, is the focus of [responsible AI](/aws/aif-c01/guidelines-for-responsible-ai), domain 4 of the exam.

## Bottom line

The rule is short: if a prompt produces new content, it is a generative AI task; if it returns a label, number, or ranking from existing data, it is not. Hold onto that and the exam-style "which of these is a generative AI task" questions become quick wins. To practice the real thing, drill the free, open-source [Fundamentals of Generative AI](/aws/aif-c01/fundamentals-of-generative-ai) questions, each with a written explanation, then take a full-length [AIF-C01 practice exam](/aws/aif-c01). If you are still weighing the cert itself, see [AIF-C01 vs CLF-C02: which to take first](/blog/aif-c01-vs-clf-c02).

## Frequently asked questions

### What would be an appropriate task for using generative AI?

Appropriate tasks are ones that create new content or language: drafting text, summarizing documents, generating images or code, answering questions, and translating. Generative AI fits when the goal is to produce something new from a prompt. It is a poor fit for exact calculations, deterministic rules, or tasks needing guaranteed correctness.

### Which tasks are not generative AI tasks?

Classification, forecasting, fraud detection, recommendation, and anomaly detection are predictive or analytical AI, not generative. They label, score, or predict from existing data rather than create new content. If the output is a category, a number, or a ranking rather than new text, image, or code, it is not generative AI.

### Is ChatGPT generative AI?

Yes. ChatGPT is a generative AI application built on a large language model, a type of foundation model. It generates new text in response to prompts, which is the defining trait of generative AI. The same category includes image, code, and audio generators built on foundation models.

### When is generative AI the wrong tool?

Avoid generative AI when you need exact, repeatable answers, strict rules, or guaranteed accuracy, since it can hallucinate and is not deterministic. Tasks like billing calculations, compliance checks, or precise numeric forecasting suit traditional logic or predictive models. Use generative AI to draft and assist, not to be the source of truth.
