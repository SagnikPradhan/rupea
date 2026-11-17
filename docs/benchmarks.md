# Benchmarks

Every request has 300 ms: 150 ms on the server and 150 ms on the network. The target is a mean under 150 ms for each case, with the 99th percentile shown beside it. The gate applies to every case a web page calls, and it is recorded here for people to read: the bench does not fail when a case is over 150 ms.

Run all benchmarks with `pnpm --filter @rupea/server bench`, which takes about 6 minutes. Add a file name, such as `pnpm --filter @rupea/server bench application-accounts`, to run one area. Each case is an application-level call, measured before transport.

The numbers below come from 2026-11-17 on an AMD Ryzen 5 5600X (6 cores, 12 threads) with 15 GB RAM on Linux, using embedded Postgres from portable-pg. Each case has 10 samples. Times are in milliseconds. Later steps update this file.

## twenty-years

| case                                 | mean (ms) | 99th percentile (ms) | mark        |
| ------------------------------------ | --------: | -------------------: | ----------- |
| files edit oldest                    |       182 |                  200 | over 150 ms |
| accounts returns all                 |       123 |                  134 |             |
| accounts drops all                   |       120 |                  140 |             |
| files edit newest                    |       113 |                  129 |             |
| accounts invested 5y                 |        74 |                   85 |             |
| accounts drops 10y                   |        69 |                   73 |             |
| files import 100                     |        62 |                   65 |             |
| accounts home bridge all             |        57 |                   66 |             |
| groups candidates in oldest          |        55 |                   56 |             |
| accounts home worth 5y               |        53 |                   57 |             |
| accounts expenses daily all          |        47 |                   49 |             |
| accounts returns year                |        44 |                   45 |             |
| accounts drops 5y                    |        44 |                   46 |             |
| accounts returns month               |        41 |                   43 |             |
| accounts invested all                |        38 |                   41 |             |
| accounts income invested all         |        38 |                   42 |             |
| accounts invested 10y                |        38 |                   40 |             |
| files statement find latest file     |        37 |                   40 |             |
| accounts home bridge 10y             |        35 |                   42 |             |
| accounts invested year               |        34 |                   41 |             |
| accounts income invested year        |        33 |                   35 |             |
| accounts income invested month       |        27 |                   28 |             |
| accounts invested month              |        26 |                   27 |             |
| accounts home bridge 5y              |        25 |                   26 |             |
| accounts holdings all                |        24 |                   25 |             |
| accounts holdings year               |        24 |                   25 |             |
| accounts holdings month              |        24 |                   25 |             |
| accounts home worth all              |        21 |                   22 |             |
| accounts drops year                  |        20 |                   21 |             |
| accounts drops month                 |        18 |                   20 |             |
| accounts home bridge year            |        17 |                   19 |             |
| accounts checks                      |        15 |                   17 |             |
| accounts expenses deltas all         |        15 |                   16 |             |
| accounts home bridge month           |        13 |                   15 |             |
| accounts home worth year             |        12 |                   14 |             |
| accounts home worth 10y              |        12 |                   14 |             |
| accounts expenses daily year         |        12 |                   13 |             |
| accounts expenses deltas year        |       8.9 |                  9.8 |             |
| accounts expenses deltas month       |       6.7 |                  7.4 |             |
| accounts home worth month            |       6.1 |                  7.2 |             |
| accounts expenses daily month        |       6.0 |                  7.0 |             |
| transactions of an account           |       5.9 |                  7.1 |             |
| groups candidates in newest          |       5.5 |                  6.3 |             |
| transactions postings of an account  |       5.3 |                  7.5 |             |
| accounts liabilities deltas month    |       4.8 |                  5.8 |             |
| accounts liabilities deltas year     |       4.8 |                  6.2 |             |
| accounts income deltas year          |       4.6 |                  5.9 |             |
| groups in oldest                     |       4.4 |                  4.5 |             |
| accounts index alone                 |       4.4 |                  5.7 |             |
| accounts income deltas all           |       4.3 |                  6.2 |             |
| accounts income deltas month         |       3.9 |                  4.2 |             |
| accounts liabilities deltas all      |       3.9 |                  4.4 |             |
| transactions by description          |       3.6 |                  3.6 |             |
| groups in newest                     |       2.8 |                  3.2 |             |
| transactions newest                  |       2.7 |                  4.5 |             |
| transactions postings by description |       2.5 |                  2.7 |             |
| transactions deep page               |       2.4 |                  2.6 |             |
| transactions last month              |       2.4 |                  2.8 |             |
| accounts lots                        |       1.3 |                  1.6 |             |
| files list files                     |       1.2 |                  1.4 |             |
| transactions postings newest         |       1.2 |                  1.2 |             |
| accounts tree                        |       0.6 |                  0.7 |             |
| files aside find transaction files   |       0.4 |                  0.5 |             |
| files read newest                    |       0.2 |                  0.3 |             |

## fifty-years

| case                                 | mean (ms) | 99th percentile (ms) | mark        |
| ------------------------------------ | --------: | -------------------: | ----------- |
| accounts drops all                   |       286 |                  300 | over 150 ms |
| files edit oldest                    |       234 |                  257 | over 150 ms |
| accounts returns all                 |       187 |                  198 | over 150 ms |
| accounts home bridge all             |       149 |                  154 |             |
| files edit newest                    |       106 |                  115 |             |
| accounts income invested all         |       102 |                  111 |             |
| accounts invested all                |       101 |                  111 |             |
| groups candidates in oldest          |        86 |                   90 |             |
| accounts invested 5y                 |        79 |                   98 |             |
| accounts drops 10y                   |        76 |                   79 |             |
| accounts home worth all              |        72 |                   92 |             |
| accounts returns year                |        70 |                   72 |             |
| accounts returns month               |        67 |                   68 |             |
| files statement find latest file     |        65 |                   67 |             |
| files import 100                     |        62 |                   66 |             |
| accounts checks                      |        59 |                   62 |             |
| accounts expenses daily all          |        52 |                   56 |             |
| accounts drops 5y                    |        51 |                   56 |             |
| accounts home worth 5y               |        49 |                   51 |             |
| accounts invested 10y                |        47 |                   63 |             |
| accounts invested year               |        43 |                   68 |             |
| accounts income invested year        |        40 |                   42 |             |
| accounts home bridge 10y             |        39 |                   40 |             |
| accounts invested month              |        34 |                   36 |             |
| accounts income invested month       |        33 |                   37 |             |
| accounts expenses deltas all         |        30 |                   32 |             |
| accounts holdings month              |        29 |                   35 |             |
| accounts home bridge 5y              |        29 |                   34 |             |
| accounts drops year                  |        29 |                   30 |             |
| accounts holdings all                |        27 |                   29 |             |
| accounts holdings year               |        27 |                   29 |             |
| accounts drops month                 |        27 |                   32 |             |
| accounts home bridge year            |        17 |                   18 |             |
| transactions of an account           |        16 |                   17 |             |
| accounts home bridge month           |        15 |                   16 |             |
| accounts home worth 10y              |        14 |                   16 |             |
| accounts home worth year             |        12 |                   14 |             |
| accounts expenses daily year         |        11 |                   13 |             |
| accounts expenses deltas year        |        11 |                   12 |             |
| groups candidates in newest          |       8.5 |                  9.2 |             |
| accounts expenses deltas month       |       8.3 |                  9.1 |             |
| accounts expenses daily month        |       7.1 |                  7.7 |             |
| accounts home worth month            |       6.9 |                  8.0 |             |
| transactions postings of an account  |       6.8 |                  8.3 |             |
| accounts income deltas all           |       5.2 |                  7.6 |             |
| accounts index alone                 |       5.1 |                  5.8 |             |
| accounts income deltas year          |       4.7 |                  5.6 |             |
| groups in oldest                     |       4.6 |                  5.8 |             |
| accounts liabilities deltas year     |       4.6 |                  5.7 |             |
| accounts liabilities deltas month    |       4.4 |                  5.6 |             |
| accounts liabilities deltas all      |       4.4 |                  5.5 |             |
| accounts income deltas month         |       4.3 |                  5.1 |             |
| transactions by description          |       3.3 |                  4.9 |             |
| groups in newest                     |       3.1 |                  3.5 |             |
| transactions deep page               |       3.1 |                  5.0 |             |
| transactions newest                  |       2.6 |                  3.2 |             |
| transactions last month              |       2.4 |                  2.5 |             |
| files list files                     |       2.3 |                  4.7 |             |
| transactions postings by description |       2.1 |                  4.1 |             |
| accounts lots                        |       1.3 |                  1.5 |             |
| transactions postings newest         |       1.3 |                  1.3 |             |
| accounts tree                        |       0.5 |                  0.7 |             |
| files aside find transaction files   |       0.4 |                  0.5 |             |
| files read newest                    |       0.3 |                  0.4 |             |

## wide

| case                                 | mean (ms) | 99th percentile (ms) | mark        |
| ------------------------------------ | --------: | -------------------: | ----------- |
| accounts drops all                   |       182 |                  198 | over 150 ms |
| accounts drops 10y                   |       179 |                  190 | over 150 ms |
| accounts invested 5y                 |       146 |                  167 |             |
| groups candidates in oldest          |       135 |                  137 |             |
| accounts drops 5y                    |       107 |                  117 |             |
| accounts home worth 5y               |       106 |                  112 |             |
| files edit oldest                    |       100 |                  102 |             |
| accounts home bridge 10y             |        91 |                   96 |             |
| accounts home bridge all             |        91 |                   94 |             |
| files import 100                     |        83 |                   88 |             |
| files edit newest                    |        78 |                   88 |             |
| accounts home bridge 5y              |        63 |                   67 |             |
| accounts expenses daily all          |        59 |                   61 |             |
| accounts returns all                 |        56 |                   59 |             |
| accounts expenses deltas all         |        41 |                   44 |             |
| accounts home bridge year            |        38 |                   40 |             |
| accounts income invested year        |        37 |                   39 |             |
| accounts invested all                |        36 |                   40 |             |
| accounts invested 10y                |        36 |                   42 |             |
| accounts income invested all         |        36 |                   37 |             |
| accounts invested year               |        35 |                   46 |             |
| accounts returns year                |        34 |                   38 |             |
| accounts returns month               |        32 |                   33 |             |
| accounts home bridge month           |        29 |                   30 |             |
| accounts drops year                  |        27 |                   28 |             |
| accounts home worth 10y              |        26 |                   40 |             |
| accounts expenses deltas year        |        26 |                   28 |             |
| accounts home worth all              |        25 |                   33 |             |
| accounts home worth year             |        23 |                   24 |             |
| accounts income invested month       |        20 |                   29 |             |
| accounts invested month              |        19 |                   20 |             |
| accounts expenses daily year         |        18 |                   19 |             |
| accounts drops month                 |        18 |                   19 |             |
| accounts holdings month              |        18 |                   19 |             |
| accounts holdings all                |        17 |                   19 |             |
| accounts holdings year               |        17 |                   19 |             |
| accounts expenses deltas month       |        14 |                   16 |             |
| accounts expenses daily month        |        12 |                   13 |             |
| accounts checks                      |        12 |                   14 |             |
| accounts home worth month            |        10 |                   12 |             |
| files statement find latest file     |       8.0 |                  9.1 |             |
| accounts index alone                 |       7.4 |                  8.7 |             |
| accounts income deltas year          |       7.1 |                  7.6 |             |
| accounts liabilities deltas month    |       7.0 |                   10 |             |
| accounts liabilities deltas year     |       6.9 |                  7.9 |             |
| accounts income deltas month         |       6.1 |                  6.8 |             |
| transactions by description          |       5.8 |                  7.9 |             |
| accounts income deltas all           |       5.5 |                  6.9 |             |
| accounts liabilities deltas all      |       5.3 |                  5.9 |             |
| transactions postings by description |       4.6 |                  4.7 |             |
| files list files                     |       3.8 |                  5.1 |             |
| transactions deep page               |       2.7 |                  4.4 |             |
| groups in oldest                     |       2.6 |                  2.9 |             |
| transactions newest                  |       2.6 |                  2.9 |             |
| transactions last month              |       2.4 |                  2.5 |             |
| groups in newest                     |       2.4 |                  2.7 |             |
| transactions of an account           |       2.3 |                  2.9 |             |
| accounts tree                        |       1.8 |                  2.3 |             |
| transactions postings newest         |       1.3 |                  1.5 |             |
| accounts lots                        |       1.3 |                  1.4 |             |
| groups candidates in newest          |       0.9 |                  1.0 |             |
| transactions postings of an account  |       0.9 |                  0.9 |             |
| files aside find transaction files   |       0.4 |                  0.5 |             |
| files read newest                    |       0.2 |                  0.2 |             |

## Still over 150 ms

On twenty-years: files edit oldest.

On fifty-years: accounts drops all, files edit oldest, accounts returns all.

On wide: accounts drops all, accounts drops 10y.
