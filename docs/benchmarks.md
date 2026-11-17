# Benchmarks

Every request has 300 ms: 150 ms on the server and 150 ms on the network. The target is a mean under 150 ms for each case, with the 99th percentile shown beside it. The gate applies to every case a web page calls, and it is recorded here for people to read: the bench does not fail when a case is over 150 ms.

Run all benchmarks with `pnpm --filter @rupea/server bench`, which takes about 6 minutes. Add a file name, such as `pnpm --filter @rupea/server bench application-accounts`, to run one area. Each case is an application-level call, measured before transport.

The numbers below come from 2026-11-17 on an AMD Ryzen 5 5600X (6 cores, 12 threads) with 15 GB RAM on Linux, using embedded Postgres from portable-pg. Each case has 10 samples. Times are in milliseconds. Later steps update this file.

## twenty-years

| case                                 | mean (ms) | 99th percentile (ms) | mark        |
| ------------------------------------ | --------: | -------------------: | ----------- |
| files edit oldest                    |       182 |                  200 | over 150 ms |
| files edit newest                    |       113 |                  129 |             |
| accounts returns all                 |       101 |                  106 |             |
| files import 100                     |        62 |                   65 |             |
| accounts invested 5y                 |        57 |                   69 |             |
| groups candidates in oldest          |        55 |                   56 |             |
| accounts home bridge all             |        51 |                   56 |             |
| accounts expenses daily all          |        46 |                   48 |             |
| accounts returns year                |        40 |                   41 |             |
| accounts invested all                |        38 |                   49 |             |
| files statement find latest file     |        37 |                   40 |             |
| accounts invested 10y                |        37 |                   40 |             |
| accounts income invested all         |        37 |                   40 |             |
| accounts drops all                   |        35 |                   41 |             |
| accounts home worth 5y               |        33 |                   38 |             |
| accounts home bridge 10y             |        32 |                   34 |             |
| accounts income invested year        |        31 |                   33 |             |
| accounts invested year               |        30 |                   31 |             |
| accounts invested month              |        28 |                   36 |             |
| accounts income invested month       |        26 |                   27 |             |
| accounts home bridge 5y              |        24 |                   27 |             |
| accounts holdings all                |        23 |                   25 |             |
| accounts holdings year               |        23 |                   24 |             |
| accounts holdings month              |        23 |                   24 |             |
| accounts returns month               |        21 |                   22 |             |
| accounts home worth all              |        21 |                   32 |             |
| accounts drops 10y                   |        21 |                   23 |             |
| accounts home bridge year            |        18 |                   20 |             |
| accounts checks                      |        15 |                   17 |             |
| accounts expenses deltas all         |        15 |                   16 |             |
| accounts home bridge month           |        14 |                   15 |             |
| accounts drops 5y                    |        13 |                   16 |             |
| accounts expenses daily year         |        11 |                   12 |             |
| accounts home worth 10y              |        11 |                   12 |             |
| accounts expenses deltas year        |        10 |                   13 |             |
| accounts home worth year             |       8.9 |                   10 |             |
| accounts expenses deltas month       |       6.4 |                  6.8 |             |
| accounts drops year                  |       6.2 |                  7.3 |             |
| transactions of an account           |       5.9 |                  7.1 |             |
| accounts expenses daily month        |       5.8 |                  6.2 |             |
| accounts drops month                 |       5.8 |                  7.1 |             |
| groups candidates in newest          |       5.5 |                  6.3 |             |
| accounts liabilities deltas year     |       5.4 |                  6.4 |             |
| transactions postings of an account  |       5.3 |                  7.5 |             |
| accounts income deltas year          |       4.7 |                  5.6 |             |
| accounts home worth month            |       4.7 |                  5.3 |             |
| accounts income deltas month         |       4.5 |                  5.2 |             |
| groups in oldest                     |       4.4 |                  4.5 |             |
| accounts income deltas all           |       4.2 |                  5.6 |             |
| accounts liabilities deltas month    |       4.1 |                  4.4 |             |
| accounts index alone                 |       4.1 |                  5.1 |             |
| accounts liabilities deltas all      |       3.9 |                  4.4 |             |
| transactions by description          |       3.6 |                  3.6 |             |
| groups in newest                     |       2.8 |                  3.2 |             |
| transactions newest                  |       2.7 |                  4.5 |             |
| transactions postings by description |       2.5 |                  2.7 |             |
| transactions deep page               |       2.4 |                  2.6 |             |
| transactions last month              |       2.4 |                  2.8 |             |
| accounts lots                        |       1.3 |                  1.4 |             |
| files list files                     |       1.2 |                  1.4 |             |
| transactions postings newest         |       1.2 |                  1.2 |             |
| accounts tree                        |       0.5 |                  0.7 |             |
| files aside find transaction files   |       0.4 |                  0.5 |             |
| files read newest                    |       0.2 |                  0.3 |             |

## fifty-years

| case                                 | mean (ms) | 99th percentile (ms) | mark        |
| ------------------------------------ | --------: | -------------------: | ----------- |
| files edit oldest                    |       234 |                  257 | over 150 ms |
| accounts returns all                 |       188 |                  208 | over 150 ms |
| accounts home bridge all             |       111 |                  119 |             |
| files edit newest                    |       106 |                  115 |             |
| accounts income invested all         |        95 |                  104 |             |
| accounts invested all                |        94 |                  106 |             |
| accounts drops all                   |        88 |                  105 |             |
| groups candidates in oldest          |        86 |                   90 |             |
| files statement find latest file     |        65 |                   67 |             |
| files import 100                     |        62 |                   66 |             |
| accounts home worth all              |        62 |                   64 |             |
| accounts invested 5y                 |        61 |                   75 |             |
| accounts checks                      |        59 |                   61 |             |
| accounts expenses daily all          |        51 |                   54 |             |
| accounts invested 10y                |        44 |                   46 |             |
| accounts home bridge 10y             |        38 |                   39 |             |
| accounts income invested year        |        37 |                   39 |             |
| accounts invested year               |        36 |                   37 |             |
| accounts home worth 5y               |        34 |                   46 |             |
| accounts income invested month       |        31 |                   33 |             |
| accounts invested month              |        31 |                   33 |             |
| accounts returns year                |        29 |                   30 |             |
| accounts expenses deltas all         |        29 |                   31 |             |
| accounts home bridge 5y              |        27 |                   28 |             |
| accounts holdings all                |        26 |                   29 |             |
| accounts holdings month              |        26 |                   28 |             |
| accounts returns month               |        25 |                   27 |             |
| accounts holdings year               |        25 |                   27 |             |
| accounts drops 10y                   |        21 |                   24 |             |
| accounts home bridge year            |        21 |                   23 |             |
| accounts home bridge month           |        18 |                   26 |             |
| transactions of an account           |        16 |                   17 |             |
| accounts drops 5y                    |        14 |                   16 |             |
| accounts home worth 10y              |        12 |                   14 |             |
| accounts expenses daily year         |        11 |                   13 |             |
| accounts expenses deltas year        |        11 |                   12 |             |
| accounts home worth year             |       9.3 |                   10 |             |
| groups candidates in newest          |       8.5 |                  9.2 |             |
| accounts expenses deltas month       |       8.2 |                  8.6 |             |
| accounts drops year                  |       7.6 |                  9.6 |             |
| accounts expenses daily month        |       7.2 |                  8.1 |             |
| transactions postings of an account  |       6.8 |                  8.3 |             |
| accounts drops month                 |       6.2 |                  7.5 |             |
| accounts home worth month            |       5.8 |                  6.8 |             |
| accounts index alone                 |       5.3 |                  6.2 |             |
| accounts liabilities deltas year     |       5.0 |                  7.1 |             |
| accounts income deltas all           |       4.8 |                  5.3 |             |
| accounts income deltas year          |       4.8 |                  5.8 |             |
| groups in oldest                     |       4.6 |                  5.8 |             |
| accounts liabilities deltas all      |       4.3 |                  5.0 |             |
| accounts liabilities deltas month    |       4.2 |                  4.7 |             |
| accounts income deltas month         |       4.0 |                  4.4 |             |
| transactions by description          |       3.3 |                  4.9 |             |
| groups in newest                     |       3.1 |                  3.5 |             |
| transactions deep page               |       3.1 |                  5.0 |             |
| transactions newest                  |       2.6 |                  3.2 |             |
| transactions last month              |       2.4 |                  2.5 |             |
| files list files                     |       2.3 |                  4.7 |             |
| transactions postings by description |       2.1 |                  4.1 |             |
| accounts lots                        |       1.4 |                  1.6 |             |
| transactions postings newest         |       1.3 |                  1.3 |             |
| accounts tree                        |       0.5 |                  0.7 |             |
| files aside find transaction files   |       0.4 |                  0.5 |             |
| files read newest                    |       0.3 |                  0.4 |             |

## wide

| case                                 | mean (ms) | 99th percentile (ms) | mark |
| ------------------------------------ | --------: | -------------------: | ---- |
| groups candidates in oldest          |       135 |                  137 |      |
| accounts invested 5y                 |       106 |                  122 |      |
| files edit oldest                    |       100 |                  102 |      |
| files import 100                     |        83 |                   88 |      |
| files edit newest                    |        78 |                   88 |      |
| accounts home bridge 10y             |        73 |                   79 |      |
| accounts home bridge all             |        70 |                   73 |      |
| accounts returns all                 |        64 |                   69 |      |
| accounts home worth 5y               |        63 |                   78 |      |
| accounts expenses daily all          |        60 |                   64 |      |
| accounts drops all                   |        56 |                   64 |      |
| accounts drops 10y                   |        56 |                   65 |      |
| accounts home bridge 5y              |        54 |                   60 |      |
| accounts expenses deltas all         |        39 |                   40 |      |
| accounts returns year                |        39 |                   41 |      |
| accounts returns month               |        38 |                   41 |      |
| accounts home bridge year            |        36 |                   36 |      |
| accounts invested 10y                |        35 |                   43 |      |
| accounts invested all                |        35 |                   45 |      |
| accounts income invested all         |        34 |                   36 |      |
| accounts drops 5y                    |        33 |                   40 |      |
| accounts expenses deltas year        |        30 |                   37 |      |
| accounts income invested year        |        29 |                   33 |      |
| accounts home bridge month           |        27 |                   28 |      |
| accounts invested year               |        26 |                   27 |      |
| accounts home worth all              |        22 |                   30 |      |
| accounts home worth 10y              |        21 |                   25 |      |
| accounts expenses daily year         |        19 |                   21 |      |
| accounts income invested month       |        19 |                   24 |      |
| accounts invested month              |        17 |                   18 |      |
| accounts holdings all                |        16 |                   17 |      |
| accounts holdings year               |        16 |                   17 |      |
| accounts holdings month              |        16 |                   16 |      |
| accounts home worth year             |        15 |                   17 |      |
| accounts expenses deltas month       |        14 |                   15 |      |
| accounts drops year                  |        14 |                   16 |      |
| accounts expenses daily month        |        13 |                   13 |      |
| accounts checks                      |        12 |                   13 |      |
| accounts drops month                 |        12 |                   14 |      |
| accounts home worth month            |       8.9 |                   13 |      |
| files statement find latest file     |       8.0 |                  9.1 |      |
| accounts index alone                 |       7.5 |                  8.5 |      |
| accounts income deltas year          |       7.1 |                  8.7 |      |
| accounts liabilities deltas year     |       7.0 |                  8.1 |      |
| accounts liabilities deltas month    |       6.4 |                  7.0 |      |
| accounts income deltas month         |       6.0 |                  6.6 |      |
| transactions by description          |       5.8 |                  7.9 |      |
| accounts income deltas all           |       5.4 |                  6.3 |      |
| accounts liabilities deltas all      |       5.4 |                  6.4 |      |
| transactions postings by description |       4.6 |                  4.7 |      |
| files list files                     |       3.8 |                  5.1 |      |
| transactions deep page               |       2.7 |                  4.4 |      |
| groups in oldest                     |       2.6 |                  2.9 |      |
| transactions newest                  |       2.6 |                  2.9 |      |
| transactions last month              |       2.4 |                  2.5 |      |
| groups in newest                     |       2.4 |                  2.7 |      |
| transactions of an account           |       2.3 |                  2.9 |      |
| accounts tree                        |       1.9 |                  2.4 |      |
| accounts lots                        |       1.4 |                  1.9 |      |
| transactions postings newest         |       1.3 |                  1.5 |      |
| groups candidates in newest          |       0.9 |                  1.0 |      |
| transactions postings of an account  |       0.9 |                  0.9 |      |
| files aside find transaction files   |       0.4 |                  0.5 |      |
| files read newest                    |       0.2 |                  0.2 |      |

## Still over 150 ms

On twenty-years: files edit oldest.

On fifty-years: files edit oldest, accounts returns all.

On wide: nothing.
