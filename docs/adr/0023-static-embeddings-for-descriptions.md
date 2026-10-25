# Static embeddings for descriptions

Descriptions are embedded with [potion-base-8M](https://huggingface.co/minishlab/potion-base-8M) (MIT), a model2vec static model: each token has one row in a table, and a text's vector is the mean of its tokens' rows, normalised. There is no network to run, so `shared/onnx` reads the table from its safetensors file and averages it in plain TypeScript.

Replaying one real ledger of 3,492 statement lines through `classify`, each statement predicted from what came before it, potion and the all-MiniLM-L6-v2 transformer it replaces got the same lines right (1,792 against 1,798), while embedding took 34 ms instead of 1,144 ms.

## Considered Options

- **Keeping all-MiniLM-L6-v2 and tuning its threads and batches**: the model run is nine tenths of the time, and the best settings saved about 15%.
- **A larger static model**: potion-base-8M already matches the transformer on descriptions, which are a few words long.

## Consequences

- Vectors have 256 dimensions instead of 384, which also shrinks the index over them.
- Embedding is cheap enough that texts are no longer kept in memory between calls.
