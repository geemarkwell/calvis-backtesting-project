# Current limitations / what is not fully done yet

1. **Reusable evaluator registry is not fully generalized.**  
   Maya has deterministic measurement selection, but not yet a formal evaluator registry like:
   - task success
   - tool correctness
   - tool efficiency
   - safety
   - cost
   - latency
   - consistency

2. **Regression suite is not complete.**  
   The system can run targeted backtests, but a master policy/regression pack across many jobs is not yet a first-class artifact.

3. **Stop condition for iterative improvement is not implemented.**  
   The one-way pass exists. The loop that decides whether to run Theo again automatically is not yet built.

4. **Cost and latency are not deeply surfaced.**  
   Model configs are recorded, but full cost accounting does not appear to be a major implemented feature yet.

5. **Test execution could not be verified locally in this environment.**  
   `yarn` is not installed and `node_modules` are absent, so I could not run the Jest suite. The repo does contain 43 backend spec files, which is a strong sign of test coverage around the important pieces.
