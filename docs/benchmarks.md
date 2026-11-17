# Benchmarks

Every request has 300 ms: 150 ms on the server and 150 ms on the network. The target is a mean under 150 ms for each case, with the 99th percentile shown beside it. The gate applies to every case a web page calls, and it is recorded here for people to read: the bench does not fail when a case is over 150 ms.

Run all benchmarks with `pnpm --filter @rupea/server bench`, which takes about 6 minutes. Add a file name, such as `pnpm --filter @rupea/server bench application-accounts`, to run one area. Each case is an application-level call, measured before transport.

The numbers below come from 2026-11-18 on an AMD Ryzen 5 5600X (6 cores, 12 threads) with 15 GB RAM on Linux, using embedded Postgres from portable-pg. Each case has 10 samples. Times are in milliseconds. Later steps update this file.

## twenty-years

| case                                 | mean (ms) | 99th percentile (ms) | mark |
| ------------------------------------ | --------: | -------------------: | ---- |
| files edit oldest                    |       116 |                  134 |      |
| accounts returns all                 |       116 |                  119 |      |
| files edit newest                    |        96 |                  104 |      |
| accounts invested 5y                 |        58 |                   69 |      |
| groups candidates in oldest          |        55 |                   58 |      |
| accounts home bridge all             |        47 |                   53 |      |
| accounts expenses daily all          |        46 |                   48 |      |
| files import 100                     |        45 |                   49 |      |
| accounts invested all                |        37 |                   39 |      |
| accounts income invested all         |        37 |                   39 |      |
| accounts invested 10y                |        37 |                   39 |      |
| files statement find latest file     |        36 |                   39 |      |
| accounts drops all                   |        35 |                   41 |      |
| accounts returns year                |        35 |                   36 |      |
| accounts home worth 5y               |        34 |                   39 |      |
| accounts income invested year        |        31 |                   32 |      |
| accounts home bridge 10y             |        31 |                   33 |      |
| accounts invested year               |        30 |                   32 |      |
| accounts income invested month       |        26 |                   28 |      |
| accounts invested month              |        26 |                   27 |      |
| accounts holdings year               |        24 |                   27 |      |
| accounts holdings all                |        24 |                   25 |      |
| accounts holdings month              |        24 |                   25 |      |
| accounts home bridge 5y              |        23 |                   24 |      |
| accounts drops 10y                   |        21 |                   24 |      |
| accounts home worth all              |        20 |                   22 |      |
| accounts home bridge year            |        19 |                   28 |      |
| accounts returns month               |        16 |                   18 |      |
| accounts expenses deltas all         |        15 |                   16 |      |
| accounts checks                      |        15 |                   17 |      |
| accounts home bridge month           |        13 |                   14 |      |
| accounts drops 5y                    |        13 |                   16 |      |
| accounts expenses daily year         |        11 |                   13 |      |
| accounts home worth 10y              |        11 |                   12 |      |
| accounts expenses deltas year        |       9.6 |                   11 |      |
| accounts home worth year             |       8.9 |                   10 |      |
| accounts expenses deltas month       |       7.1 |                  7.9 |      |
| accounts drops year                  |       6.4 |                  8.4 |      |
| accounts expenses daily month        |       6.1 |                  6.9 |      |
| transactions of an account           |       5.7 |                  6.9 |      |
| groups candidates in newest          |       5.6 |                  6.4 |      |
| accounts home worth month            |       5.3 |                  6.6 |      |
| transactions postings of an account  |       4.8 |                  5.6 |      |
| accounts liabilities deltas year     |       4.7 |                  6.0 |      |
| accounts income deltas year          |       4.7 |                  6.1 |      |
| accounts drops month                 |       4.6 |                  5.1 |      |
| accounts liabilities deltas month    |       4.4 |                  5.8 |      |
| groups in oldest                     |       4.4 |                  4.5 |      |
| accounts income deltas month         |       4.1 |                  4.3 |      |
| accounts income deltas all           |       4.0 |                  4.6 |      |
| accounts index alone                 |       4.0 |                  4.9 |      |
| accounts liabilities deltas all      |       4.0 |                  4.3 |      |
| transactions by description          |       3.6 |                  3.7 |      |
| groups in newest                     |       2.7 |                  3.0 |      |
| transactions newest                  |       2.6 |                  3.4 |      |
| transactions deep page               |       2.5 |                  2.8 |      |
| transactions last month              |       2.5 |                  3.9 |      |
| transactions postings by description |       2.4 |                  2.5 |      |
| transactions postings newest         |       1.5 |                  3.1 |      |
| files list files                     |       1.4 |                  2.4 |      |
| accounts lots                        |       1.3 |                  1.5 |      |
| accounts tree                        |       0.5 |                  0.7 |      |
| files aside find transaction files   |       0.4 |                  0.5 |      |
| files read newest                    |       0.4 |                  0.5 |      |

## fifty-years

| case                                 | mean (ms) | 99th percentile (ms) | mark        |
| ------------------------------------ | --------: | -------------------: | ----------- |
| accounts returns all                 |       229 |                  252 | over 150 ms |
| accounts home bridge all             |       108 |                  114 |             |
| files edit oldest                    |       101 |                  118 |             |
| accounts invested all                |        96 |                  107 |             |
| accounts income invested all         |        96 |                  108 |             |
| accounts drops all                   |        91 |                  106 |             |
| groups candidates in oldest          |        86 |                   89 |             |
| files edit newest                    |        86 |                  100 |             |
| accounts home worth all              |        66 |                   80 |             |
| files statement find latest file     |        62 |                   65 |             |
| accounts invested 5y                 |        60 |                   63 |             |
| accounts checks                      |        56 |                   60 |             |
| accounts expenses daily all          |        52 |                   55 |             |
| files import 100                     |        44 |                   46 |             |
| accounts invested 10y                |        44 |                   46 |             |
| accounts income invested year        |        36 |                   37 |             |
| accounts invested year               |        36 |                   41 |             |
| accounts home bridge 10y             |        36 |                   37 |             |
| accounts home worth 5y               |        32 |                   38 |             |
| accounts invested month              |        31 |                   32 |             |
| accounts income invested month       |        31 |                   31 |             |
| accounts expenses deltas all         |        30 |                   31 |             |
| accounts home bridge 5y              |        27 |                   30 |             |
| accounts holdings year               |        26 |                   28 |             |
| accounts holdings all                |        26 |                   27 |             |
| accounts holdings month              |        25 |                   26 |             |
| accounts returns year                |        24 |                   28 |             |
| accounts drops 10y                   |        22 |                   28 |             |
| accounts home bridge year            |        20 |                   21 |             |
| accounts returns month               |        19 |                   21 |             |
| accounts home bridge month           |        16 |                   17 |             |
| transactions of an account           |        16 |                   18 |             |
| accounts drops 5y                    |        14 |                   17 |             |
| accounts home worth 10y              |        13 |                   20 |             |
| accounts expenses daily year         |        12 |                   13 |             |
| accounts home worth year             |        11 |                   24 |             |
| accounts expenses deltas year        |        11 |                   12 |             |
| groups candidates in newest          |       8.8 |                  9.6 |             |
| accounts expenses deltas month       |       8.2 |                  9.0 |             |
| transactions postings of an account  |       7.4 |                  8.8 |             |
| accounts drops year                  |       7.2 |                  8.9 |             |
| accounts expenses daily month        |       7.1 |                  7.3 |             |
| accounts home worth month            |       6.0 |                  6.8 |             |
| accounts drops month                 |       5.9 |                  7.5 |             |
| accounts index alone                 |       4.9 |                  5.7 |             |
| accounts liabilities deltas year     |       4.9 |                  5.7 |             |
| accounts income deltas year          |       4.8 |                  5.7 |             |
| accounts income deltas all           |       4.7 |                  5.2 |             |
| accounts liabilities deltas month    |       4.5 |                  6.2 |             |
| groups in oldest                     |       4.5 |                  5.8 |             |
| accounts liabilities deltas all      |       4.5 |                  5.7 |             |
| accounts income deltas month         |       4.3 |                  4.6 |             |
| groups in newest                     |       3.1 |                  3.7 |             |
| transactions by description          |       3.0 |                  3.1 |             |
| transactions newest                  |       2.7 |                  4.5 |             |
| transactions deep page               |       2.6 |                  3.0 |             |
| transactions last month              |       2.4 |                  2.6 |             |
| files list files                     |       2.2 |                  3.1 |             |
| transactions postings by description |       1.9 |                  2.2 |             |
| accounts lots                        |       1.4 |                  1.7 |             |
| transactions postings newest         |       1.3 |                  1.4 |             |
| accounts tree                        |       0.5 |                  0.7 |             |
| files aside find transaction files   |       0.4 |                  0.5 |             |
| files read newest                    |       0.2 |                  0.4 |             |

## wide

| case                                 | mean (ms) | 99th percentile (ms) | mark |
| ------------------------------------ | --------: | -------------------: | ---- |
| groups candidates in oldest          |       133 |                  134 |      |
| accounts invested 5y                 |       109 |                  123 |      |
| accounts home bridge all             |        70 |                   72 |      |
| accounts home bridge 10y             |        69 |                   72 |      |
| accounts expenses daily all          |        66 |                   70 |      |
| accounts home worth 5y               |        63 |                   76 |      |
| files edit oldest                    |        60 |                   64 |      |
| files import 100                     |        59 |                   60 |      |
| accounts returns all                 |        59 |                   62 |      |
| accounts drops all                   |        58 |                   70 |      |
| accounts drops 10y                   |        55 |                   65 |      |
| files edit newest                    |        53 |                   55 |      |
| accounts home bridge 5y              |        53 |                   59 |      |
| accounts expenses deltas all         |        42 |                   44 |      |
| accounts income invested all         |        38 |                   44 |      |
| accounts invested all                |        36 |                   48 |      |
| accounts home bridge year            |        35 |                   37 |      |
| accounts invested 10y                |        35 |                   40 |      |
| accounts drops 5y                    |        31 |                   38 |      |
| accounts returns year                |        30 |                   31 |      |
| accounts income invested year        |        30 |                   34 |      |
| accounts expenses deltas year        |        28 |                   32 |      |
| accounts returns month               |        27 |                   30 |      |
| accounts invested year               |        27 |                   29 |      |
| accounts home bridge month           |        26 |                   28 |      |
| accounts home worth all              |        24 |                   26 |      |
| accounts home worth 10y              |        23 |                   27 |      |
| accounts expenses daily year         |        20 |                   22 |      |
| accounts invested month              |        18 |                   20 |      |
| accounts income invested month       |        18 |                   19 |      |
| accounts holdings all                |        18 |                   19 |      |
| accounts holdings year               |        16 |                   17 |      |
| accounts holdings month              |        16 |                   17 |      |
| accounts home worth year             |        16 |                   18 |      |
| accounts expenses deltas month       |        16 |                   17 |      |
| accounts expenses daily month        |        14 |                   14 |      |
| accounts checks                      |        12 |                   13 |      |
| accounts drops year                  |        11 |                   13 |      |
| accounts home worth month            |       8.9 |                   11 |      |
| accounts drops month                 |       8.8 |                  9.9 |      |
| files statement find latest file     |       8.0 |                  9.1 |      |
| accounts liabilities deltas month    |       7.7 |                   15 |      |
| accounts income deltas year          |       6.8 |                  8.3 |      |
| accounts liabilities deltas year     |       6.8 |                  7.7 |      |
| accounts index alone                 |       6.7 |                  7.7 |      |
| accounts income deltas all           |       6.2 |                  7.8 |      |
| accounts income deltas month         |       6.1 |                  6.8 |      |
| accounts liabilities deltas all      |       5.5 |                  6.2 |      |
| files list files                     |       3.8 |                  4.7 |      |
| transactions deep page               |       2.7 |                  4.4 |      |
| transactions by description          |       2.6 |                  3.9 |      |
| groups in oldest                     |       2.6 |                  2.7 |      |
| transactions newest                  |       2.5 |                  2.6 |      |
| transactions last month              |       2.4 |                  2.6 |      |
| groups in newest                     |       2.4 |                  2.7 |      |
| transactions of an account           |       2.4 |                  2.4 |      |
| accounts tree                        |       1.8 |                  2.0 |      |
| transactions postings by description |       1.6 |                  1.7 |      |
| transactions postings newest         |       1.3 |                  1.5 |      |
| accounts lots                        |       1.2 |                  1.4 |      |
| transactions postings of an account  |       0.9 |                  1.0 |      |
| groups candidates in newest          |       0.9 |                  1.0 |      |
| files aside find transaction files   |       0.4 |                  0.6 |      |
| files read newest                    |       0.2 |                  0.2 |      |

## Still over 150 ms

On twenty-years: nothing.

On fifty-years: accounts returns all.

On wide: nothing.
