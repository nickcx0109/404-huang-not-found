# 協作流程

## 第一次設定（每個人都要做）

1. 安裝 Git、Git LFS，以及之後統一的 Unity 版本。
2. 設定 commit 身分，email 一定要是 GitHub 帳號認得的 email，否則 commit 不會算到你頭上。最保險的是 GitHub 給的 noreply email（GitHub → Settings → Emails 可以看到）：

   ```bash
   git config user.name "你的名字"
   git config user.email "數字ID+帳號@users.noreply.github.com"
   ```

3. clone 之後跑一次 `git lfs install`。
4. 推一個小 commit（例如在 `docs/DEVLOG.md` 寫自己的名字），到 GitHub 上確認 commit 有顯示你的頭像。

## 日常流程

1. 從 GitHub Issues 領一個任務，指派給自己。
2. 從最新的 `main` 開分支：`feat/player-recoil`、`fix/enemy-stuck`。
3. 小步 commit，訊息用 Conventional Commits（見 `AGENTS.md`）。
4. 開 PR，至少一位組員 review 後，**用 Merge commit 合併**（不要 squash，squash 會把你的多個 commit 壓成一個）。PR 由作者自己按合併。
5. 每週會議前，各自在 `docs/DEVLOG.md` 寫幾行這週做了什麼。

## 一起寫程式的時候

兩三個人一起完成的 commit，由操作電腦的人 commit，並在訊息最後加上一起做的人：

```
feat(enemy): add tank slam telegraph

Co-authored-by: 名字 <對方的 GitHub email>
```

這只用在真的一起做的情況。注意：評分程式可能只看 commit 作者，co-author 不一定會算分，這點要先問助教。

## 平均貢獻

我們不在事後改寫 commit 作者。平均靠的是平常分工：

- 每週跑一次 `python tools/contrib_report.py`，看三個人的 commit 數與改動行數。
- 差距變大時，下一週把新任務優先分給落後的人，或讓落後的人主導 pair programming。
- 期末報告附上 `contrib_report.py` 的結果和 DEVLOG，誠實說明每個人做了什麼。

## 避免 Unity 衝突

- 每人在自己的資料夾和 Dev 場景工作；功能做成 prefab，改 prefab 而不是改場景。
- Unity 設定 Force Text 與 Visible Meta Files，`.meta` 一定要一起 commit。
- 三人用同一個 Unity 版本。
