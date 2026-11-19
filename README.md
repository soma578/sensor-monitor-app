# 水ピィ杭・通信確認ツール

地図アプリとは別のVercelプロジェクトとしてデプロイする、公開の通信確認画面。誰でもボタンを押してGoogle Sheetの `latest` を取得し、受信履歴のある各機器の `lastReceivedAt` を順番に判定・CSV出力できる。センサー本体へ直接問い合わせる機能ではない。地図上のアラーム表示は行わない。

## 初期設定

水ピィ杭受信APIと同じSpreadsheetの `latest` タブを使う。`devices` タブの作成や手動入力は不要。logpotから新しい杭IDのデータが届くと、受信APIが `latest` に追加し、次回の確認から自動で監視対象になる。ただし、一度も送信されていない機器は `latest` に存在せず、検出できない。「設置済み全機器」の網羅確認が必要になった場合だけ、別途logpotの機器台帳との照合が必要。

このディレクトリは地図リポジトリ `SVG` と同じ階層に置き、別のGitリポジトリとして管理する。Vercelではその監視ツール専用リポジトリを新しいプロジェクトとしてImportし、Root Directoryはリポジトリのルートにする。Framework PresetはNext.js。地図用Vercelプロジェクトの設定は変更しない。

新プロジェクトの環境変数へ次を設定する。サービスアカウントJSONをGitや公開画面に書かない。

```text
SENSOR_MONITOR_SHEET_ID=<水ピィ杭受信APIと同じSpreadsheet ID>
SENSOR_MONITOR_LATEST_SHEET_NAME=latest
SENSOR_MONITOR_GOOGLE_SERVICE_ACCOUNT_JSON=<そのSpreadsheetを閲覧できるサービスアカウントJSON>
```

タブ名は省略時 `latest`。保存先のSpreadsheetだけ既存の受信APIと共有する。監視側の環境変数・サービスアカウント設定・デプロイは独立している。サービスアカウントにはそのSpreadsheetの閲覧権限以上が必要。同じ認証情報を新プロジェクトにも設定する場合、そのアクセス権限は共有されるため、より厳密に分離したければ監視専用の閲覧権限のみのサービスアカウントを発行する。

新プロジェクトのURLを共有すれば、キーなしで誰でも閲覧・CSV取得できる。機器ID・機器名・最終通信時刻・判定が公開されるため、公開してよいSheetだけを接続する。以前の `SENSOR_MONITOR_API_KEY` と `SENSOR_MONITOR_DEVICES_SHEET_NAME` は不要で、設定済みならVercelから削除してよい。

## 判定とCSV

閾値は1～336時間の整数で指定でき、初期値は30時間。実行時刻との差が閾値以上なら `通信なし・要確認`、最終通信時刻が5分を超えて未来なら `時刻異常`。この2種を `ALARM` としてCSVへ記録する。未受信の機器は一覧に現れない。

CSVには機器ID、機器名、最終通信時刻、経過時間、閾値、判定、アラーム印、確認実行時刻を含める。通信が止まった理由はこのデータだけでは分からないため、`故障`、`電源断`、`電池切れ` とは断定しない。最終通信時刻が送信元時計に依存する点にも注意する。

APIは公開の `POST /api/check`、JSON本文 `{ "thresholdHours": 30 }`。判定結果とCSV文字列を返し、ブラウザ・CDNにキャッシュさせない。監視アプリはService Workerを登録しない。受信APIの `MIZUPIGUI_API_KEY` は使わない。公開APIへの大量アクセスがある場合は、Vercel側でレート制限・ファイアウォールを追加する。

ローカル確認は `cd ../sensor-monitor-app && npm ci && npm test && npm run dev`（`SVG` ディレクトリから実行する場合）。地図用の `assets:prepare` は実行されない。
