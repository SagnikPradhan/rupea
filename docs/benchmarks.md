# Benchmarks

Every request has 300 ms: 150 ms on the server and 150 ms on the network. The target is a mean under 150 ms for each case, with the 99th percentile shown beside it. The gate applies to every case a web page calls, and it is recorded here for people to read: the bench does not fail when a case is over 150 ms.

Run all benchmarks with `pnpm --filter @rupea/server bench`, which takes about 6 minutes. Add a file name, such as `pnpm --filter @rupea/server bench application-accounts`, to run one area. Each case is an application-level call, measured before transport.

The numbers below come from 2026-11-18 on an AMD Ryzen 5 5600X (6 cores, 12 threads) with 15 GB RAM on Linux, using embedded Postgres from portable-pg. Each case has 10 samples. Times are in milliseconds. Later steps update this file.

## twenty-years

| case                                 | mean (ms) | 99th percentile (ms) | mark |
| ------------------------------------ | --------: | -------------------: | ---- |
| files edit oldest                    |       131 |                  152 |      |
| files edit newest                    |       112 |                  130 |      |
| accounts returns all                 |        84 |                   95 |      |
| files import 100                     |        63 |                   70 |      |
| accounts invested 5y                 |        57 |                   66 |      |
| groups candidates in oldest          |        54 |                   58 |      |
| accounts home bridge all             |        48 |                   54 |      |
| accounts expenses daily all          |        46 |                   49 |      |
| accounts invested 10y                |        38 |                   45 |      |
| accounts income invested all         |        38 |                   41 |      |
| accounts invested all                |        37 |                   38 |      |
| files statement find latest file     |        36 |                   38 |      |
| accounts returns year                |        35 |                   38 |      |
| accounts drops all                   |        34 |                   39 |      |
| accounts home worth 5y               |        34 |                   41 |      |
| accounts home bridge 10y             |        31 |                   32 |      |
| accounts invested year               |        31 |                   36 |      |
| accounts income invested year        |        30 |                   32 |      |
| accounts income invested month       |        26 |                   30 |      |
| accounts invested month              |        25 |                   27 |      |
| accounts home bridge 5y              |        24 |                   30 |      |
| accounts holdings month              |        23 |                   25 |      |
| accounts holdings all                |        23 |                   24 |      |
| accounts holdings year               |        23 |                   24 |      |
| accounts drops 10y                   |        20 |                   22 |      |
| accounts home worth all              |        18 |                   20 |      |
| accounts home bridge year            |        17 |                   18 |      |
| accounts returns month               |        17 |                   19 |      |
| accounts expenses deltas all         |        15 |                   16 |      |
| accounts checks                      |        15 |                   17 |      |
| accounts home bridge month           |        13 |                   14 |      |
| accounts drops 5y                    |        13 |                   16 |      |
| accounts expenses daily year         |        12 |                   14 |      |
| accounts home worth 10y              |        11 |                   12 |      |
| accounts expenses deltas year        |       9.4 |                   11 |      |
| accounts home worth year             |       9.1 |                   10 |      |
| accounts expenses deltas month       |       6.7 |                  7.0 |      |
| transactions of an account           |       6.1 |                  7.3 |      |
| accounts expenses daily month        |       5.8 |                  6.0 |      |
| accounts drops year                  |       5.8 |                  7.4 |      |
| groups candidates in newest          |       5.4 |                  6.2 |      |
| accounts income deltas year          |       5.3 |                  5.8 |      |
| accounts home worth month            |       5.1 |                  6.9 |      |
| accounts drops month                 |       4.8 |                  6.0 |      |
| accounts liabilities deltas year     |       4.7 |                  5.3 |      |
| transactions postings of an account  |       4.7 |                  5.5 |      |
| accounts liabilities deltas month    |       4.6 |                  6.2 |      |
| groups in oldest                     |       4.4 |                  4.7 |      |
| accounts income deltas month         |       4.2 |                  5.4 |      |
| accounts income deltas all           |       4.1 |                  4.8 |      |
| accounts index alone                 |       3.9 |                  5.0 |      |
| accounts liabilities deltas all      |       3.9 |                  4.3 |      |
| transactions by description          |       3.6 |                  4.0 |      |
| transactions last month              |       3.2 |                  5.3 |      |
| groups in newest                     |       2.7 |                  3.1 |      |
| transactions deep page               |       2.5 |                  2.7 |      |
| transactions postings by description |       2.4 |                  2.5 |      |
| transactions newest                  |       2.3 |                  2.5 |      |
| transactions postings newest         |       1.4 |                  2.9 |      |
| accounts lots                        |       1.3 |                  1.4 |      |
| files list files                     |       1.1 |                  1.3 |      |
| accounts tree                        |       0.5 |                  0.6 |      |
| files aside find transaction files   |       0.3 |                  0.4 |      |
| files read newest                    |       0.3 |                  0.4 |      |

## fifty-years

| case                                 | mean (ms) | 99th percentile (ms) | mark                            |
| ------------------------------------ | --------: | -------------------: | ------------------------------- |
| accounts returns all                 |       179 |                  202 | over 150 ms, waived by decision |
| files edit oldest                    |       115 |                  128 |                                 |
| accounts home bridge all             |       106 |                  108 |                                 |
| files edit newest                    |       100 |                  113 |                                 |
| accounts income invested all         |        95 |                  103 |                                 |
| accounts invested all                |        95 |                  103 |                                 |
| accounts drops all                   |        87 |                  110 |                                 |
| groups candidates in oldest          |        84 |                   87 |                                 |
| accounts home worth all              |        65 |                   85 |                                 |
| accounts invested 5y                 |        63 |                   75 |                                 |
| files statement find latest file     |        62 |                   63 |                                 |
| files import 100                     |        60 |                   64 |                                 |
| accounts checks                      |        58 |                   65 |                                 |
| accounts expenses daily all          |        52 |                   58 |                                 |
| accounts invested 10y                |        43 |                   45 |                                 |
| accounts invested year               |        39 |                   54 |                                 |
| accounts income invested year        |        37 |                   40 |                                 |
| accounts home bridge 10y             |        36 |                   37 |                                 |
| accounts home worth 5y               |        32 |                   35 |                                 |
| accounts invested month              |        31 |                   32 |                                 |
| accounts income invested month       |        31 |                   33 |                                 |
| accounts expenses deltas all         |        31 |                   33 |                                 |
| accounts home bridge 5y              |        28 |                   37 |                                 |
| accounts holdings month              |        26 |                   28 |                                 |
| accounts holdings year               |        26 |                   30 |                                 |
| accounts holdings all                |        25 |                   27 |                                 |
| accounts returns year                |        24 |                   26 |                                 |
| accounts drops 10y                   |        21 |                   25 |                                 |
| accounts home bridge year            |        21 |                   23 |                                 |
| accounts returns month               |        20 |                   21 |                                 |
| transactions of an account           |        16 |                   17 |                                 |
| accounts home bridge month           |        16 |                   17 |                                 |
| accounts drops 5y                    |        15 |                   19 |                                 |
| accounts expenses daily year         |        12 |                   13 |                                 |
| accounts home worth 10y              |        12 |                   14 |                                 |
| accounts expenses deltas year        |        10 |                   11 |                                 |
| accounts home worth year             |       9.4 |                   10 |                                 |
| groups candidates in newest          |       8.2 |                  9.0 |                                 |
| accounts expenses deltas month       |       8.1 |                   10 |                                 |
| transactions postings of an account  |       7.5 |                  9.2 |                                 |
| accounts expenses daily month        |       7.1 |                  7.9 |                                 |
| accounts drops year                  |       6.9 |                  8.7 |                                 |
| accounts home worth month            |       5.9 |                  6.9 |                                 |
| accounts drops month                 |       5.8 |                  7.1 |                                 |
| accounts income deltas all           |       5.3 |                  8.2 |                                 |
| accounts liabilities deltas year     |       5.2 |                  7.3 |                                 |
| accounts income deltas year          |       4.9 |                  6.3 |                                 |
| accounts index alone                 |       4.9 |                  5.9 |                                 |
| groups in oldest                     |       4.6 |                  5.5 |                                 |
| accounts liabilities deltas all      |       4.5 |                  5.1 |                                 |
| accounts liabilities deltas month    |       4.2 |                  5.0 |                                 |
| accounts income deltas month         |       4.1 |                  5.0 |                                 |
| transactions by description          |       3.1 |                  3.3 |                                 |
| groups in newest                     |       3.1 |                  3.5 |                                 |
| transactions newest                  |       2.9 |                  5.1 |                                 |
| transactions deep page               |       2.6 |                  2.7 |                                 |
| transactions last month              |       2.4 |                  2.4 |                                 |
| files list files                     |       2.0 |                  2.3 |                                 |
| transactions postings by description |       1.8 |                  1.9 |                                 |
| accounts lots                        |       1.3 |                  1.5 |                                 |
| transactions postings newest         |       1.3 |                  1.3 |                                 |
| accounts tree                        |       0.5 |                  0.7 |                                 |
| files aside find transaction files   |       0.4 |                  0.5 |                                 |
| files read newest                    |       0.2 |                  0.3 |                                 |

## wide

| case                                 | mean (ms) | 99th percentile (ms) | mark |
| ------------------------------------ | --------: | -------------------: | ---- |
| groups candidates in oldest          |       132 |                  134 |      |
| accounts invested 5y                 |        96 |                  110 |      |
| files edit oldest                    |        77 |                   84 |      |
| files import 100                     |        76 |                   80 |      |
| accounts home bridge all             |        69 |                   77 |      |
| files edit newest                    |        68 |                   70 |      |
| accounts home bridge 10y             |        67 |                   73 |      |
| accounts expenses daily all          |        65 |                   68 |      |
| accounts home worth 5y               |        62 |                   73 |      |
| accounts drops 10y                   |        53 |                   62 |      |
| accounts drops all                   |        52 |                   65 |      |
| accounts returns all                 |        50 |                   52 |      |
| accounts home bridge 5y              |        48 |                   54 |      |
| accounts expenses deltas all         |        42 |                   43 |      |
| accounts invested all                |        36 |                   48 |      |
| accounts invested 10y                |        35 |                   41 |      |
| accounts income invested all         |        33 |                   35 |      |
| accounts home bridge year            |        32 |                   34 |      |
| accounts drops 5y                    |        31 |                   37 |      |
| accounts income invested year        |        30 |                   32 |      |
| accounts invested year               |        29 |                   42 |      |
| accounts returns year                |        28 |                   32 |      |
| accounts returns month               |        27 |                   30 |      |
| accounts expenses deltas year        |        25 |                   26 |      |
| accounts home bridge month           |        24 |                   25 |      |
| accounts home worth all              |        23 |                   30 |      |
| accounts home worth 10y              |        22 |                   26 |      |
| accounts income invested month       |        19 |                   24 |      |
| accounts invested month              |        18 |                   19 |      |
| accounts expenses daily year         |        18 |                   19 |      |
| accounts holdings all                |        17 |                   18 |      |
| accounts holdings month              |        16 |                   17 |      |
| accounts holdings year               |        16 |                   17 |      |
| accounts home worth year             |        15 |                   16 |      |
| accounts expenses deltas month       |        14 |                   15 |      |
| accounts expenses daily month        |        12 |                   12 |      |
| accounts checks                      |        11 |                   13 |      |
| accounts drops year                  |        11 |                   14 |      |
| accounts drops month                 |       9.0 |                  9.5 |      |
| accounts home worth month            |       8.6 |                   11 |      |
| files statement find latest file     |       7.8 |                  9.0 |      |
| accounts liabilities deltas year     |       7.0 |                  8.6 |      |
| accounts index alone                 |       6.9 |                  7.8 |      |
| accounts income deltas year          |       6.6 |                  7.0 |      |
| accounts liabilities deltas month    |       6.4 |                  7.7 |      |
| accounts income deltas month         |       6.1 |                  6.8 |      |
| accounts income deltas all           |       5.6 |                  6.9 |      |
| accounts liabilities deltas all      |       5.2 |                  6.0 |      |
| files list files                     |       4.0 |                  4.9 |      |
| transactions deep page               |       2.7 |                  4.3 |      |
| groups in oldest                     |       2.6 |                  2.7 |      |
| transactions last month              |       2.6 |                  3.3 |      |
| transactions newest                  |       2.6 |                  3.3 |      |
| groups in newest                     |       2.5 |                  2.6 |      |
| transactions by description          |       2.5 |                  2.6 |      |
| transactions of an account           |       2.2 |                  2.5 |      |
| transactions postings by description |       1.7 |                  1.8 |      |
| accounts tree                        |       1.7 |                  2.1 |      |
| transactions postings newest         |       1.4 |                  2.8 |      |
| accounts lots                        |       1.3 |                  2.4 |      |
| transactions postings of an account  |       0.9 |                  1.0 |      |
| groups candidates in newest          |       0.9 |                  1.0 |      |
| files aside find transaction files   |       0.4 |                  0.6 |      |
| files read newest                    |       0.2 |                  0.2 |      |

## Still over 150 ms

On twenty-years: nothing.

On fifty-years: accounts returns all (waived by decision on 2026-11-18, see [ADR 0045](adr/0045-a-daily-cost-table-for-returns.md)).

On wide: nothing.
