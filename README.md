# 水ピィ杭・通信確認ツール

地図アプリとは別のVercelプロジェクトとしてデプロイする、独立したオペレーター画面。監視者がボタンを押した時だけ、Google Sheet の機器台帳と `latest` を一括取得し、各機器の `lastReceivedAt` を順番に判定する。センサー本体へ直接問い合わせる機能ではない。地図上のアラーム表示は行わない。

## 初期設定

水ピィ杭受信APIと同じ Spreadsheet に `devices` タブを追加する。1行目は次の3列をこの順序で設定する。

```csv
id,name,enabled
A001,1号杭,TRUE
A002,2号杭,TRUE
```

`id` は logpot のPOSTデータの `id` と完全一致させる。`enabled=FALSE` は監視対象から外す。一度も受信していない機器も必ずここへ登録する。台帳にない機器は監視結果に出ないため、「全機器」確認の前に台帳を機器管理者と照合すること。

このディレクトリは地図リポジトリ `SVG` と同じ階層に置き、別のGitリポジトリとして管理する。Vercelではその監視ツール専用リポジトリを新しいプロジェクトとしてImportし、Root Directoryはリポジトリのルートにする。Framework PresetはNext.js。地図用Vercelプロジェクトの設定は変更しない。

新プロジェクトの環境変数へ次を設定する。キーの値をGitや公開画面に書かない。

```text
SENSOR_MONITOR_API_KEY=<受信APIとは別の32文字以上のランダムキー>
SENSOR_MONITOR_SHEET_ID=<水ピィ杭受信APIと同じSpreadsheet ID>
SENSOR_MONITOR_DEVICES_SHEET_NAME=devices
SENSOR_MONITOR_LATEST_SHEET_NAME=latest
SENSOR_MONITOR_GOOGLE_SERVICE_ACCOUNT_JSON=<そのSpreadsheetを閲覧できるサービスアカウントJSON>
```

タブ名は省略時 `devices` と `latest`。保存先のSpreadsheetだけ既存の受信APIと共有する。監視側の環境変数・サービスアカウント設定・デプロイは独立している。サービスアカウントにはそのSpreadsheetの閲覧権限以上が必要。同じ認証情報を新プロジェクトにも設定する場合、そのアクセス権限は共有されるため、より厳密に分離したければ監視専用の閲覧権限のみのサービスアカウントを発行する。

オペレーターには新プロジェクトのURLと監視者用キーを別経路で共有する。キーはブラウザの保存領域へ記録せず、画面を閉じると消える。

## 判定とCSV

閾値は1～336時間の整数で指定でき、初期値は30時間。実行時刻との差が閾値以上なら `通信なし・要確認`、受信記録がなければ `未受信`、最終通信時刻が5分を超えて未来なら `時刻異常`。後者3種を `ALARM` としてCSVへ記録する。`enabled=FALSE` は出力しない。

CSVには機器ID、機器名、最終通信時刻、経過時間、閾値、判定、アラーム印、確認実行時刻を含める。通信が止まった理由はこのデータだけでは分からないため、`故障`、`電源断`、`電池切れ` とは断定しない。最終通信時刻が送信元時計に依存する点にも注意する。

APIは `POST /api/check`、ヘッダ `X-Monitor-Key`、JSON本文 `{ "thresholdHours": 30 }`。認証成功時のみ判定結果とCSV文字列を返し、ブラウザ・CDNにキャッシュさせない。監視アプリはService Workerを登録しない。受信APIの `MIZUPIGUI_API_KEY` は使わない。

ローカル確認は `cd ../sensor-monitor-app && npm ci && npm test && npm run dev`（`SVG` ディレクトリから実行する場合）。地図用の `assets:prepare` は実行されない。
