# StashNote 公開手順 (GitHub Pages)

1. GitHubで新しいリポジトリを作る(例: `stashnote`)。
2. このフォルダの中身(index.html, sw.js, manifest.webmanifest, icon-*.png, 404.html, .nojekyll, robots.txt)をリポジトリ直下に置いてpush。
3. リポジトリの Settings → Pages → Source を「Deploy from a branch」、Branch を `main` / `/ (root)` にして保存。
4. 数分後、`https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます。
5. ログイン・同期を使う場合は、Firebaseコンソール → Authentication → 設定 → 承認済みドメインに `<ユーザー名>.github.io` を追加。

※ 公開するとブラウザごとにデータが分かれます(localStorageは公開URLのオリジン単位)。
