# Benchmarks

Every request has 300 ms: 150 ms on the server and 150 ms on the network. The target is a mean under 150 ms for each case, with the 99th percentile shown beside it. The gate applies to every case a web page calls, and it is recorded here for people to read: the bench does not fail when a case is over 150 ms.

Run all benchmarks with `pnpm --filter @rupea/server bench`, which takes about 6 minutes. Add a file name, such as `pnpm --filter @rupea/server bench application-accounts`, to run one area. Each case is an application-level call, measured before transport.

The numbers below come from 2026-11-17 on an AMD Ryzen 5 5600X (6 cores, 12 threads) with 15 GB RAM on Linux, using embedded Postgres from portable-pg. Each case has 10 samples. Times are in milliseconds. Later steps update this file.

## twenty-years

| case                                 | mean (ms) | 99th percentile (ms) | mark        |
| ------------------------------------ | --------: | -------------------: | ----------- |
| files edit oldest                    |       182 |                  200 | over 150 ms |
| accounts invested 5y                 |       125 |                  148 |             |
| accounts returns all                 |       124 |                  132 |             |
| accounts drops all                   |       120 |                  145 |             |
| files edit newest                    |       113 |                  129 |             |
| accounts drops 10y                   |        68 |                   72 |             |
| accounts home bridge all             |        66 |                   68 |             |
| accounts home worth 5y               |        64 |                   81 |             |
| files import 100                     |        62 |                   65 |             |
| groups candidates in oldest          |        55 |                   56 |             |
| accounts invested all                |        50 |                   55 |             |
| accounts expenses daily all          |        49 |                   49 |             |
| accounts invested 10y                |        49 |                   61 |             |
| accounts income invested all         |        48 |                   53 |             |
| accounts invested year               |        46 |                   50 |             |
| accounts income invested year        |        46 |                   48 |             |
| accounts returns year                |        46 |                   48 |             |
| accounts drops 5y                    |        44 |                   48 |             |
| accounts returns month               |        43 |                   45 |             |
| accounts home bridge 10y             |        42 |                   44 |             |
| files statement find latest file     |        37 |                   40 |             |
| accounts income invested month       |        36 |                   40 |             |
| accounts invested month              |        35 |                   37 |             |
| accounts home bridge 5y              |        29 |                   30 |             |
| accounts holdings year               |        29 |                   34 |             |
| accounts holdings all                |        29 |                   33 |             |
| accounts holdings month              |        28 |                   31 |             |
| accounts home worth all              |        24 |                   26 |             |
| accounts drops year                  |        23 |                   28 |             |
| accounts drops month                 |        20 |                   23 |             |
| accounts home bridge year            |        19 |                   21 |             |
| accounts home worth year             |        19 |                   47 |             |
| accounts expenses deltas all         |        16 |                   20 |             |
| accounts checks                      |        16 |                   19 |             |
| accounts home worth 10y              |        15 |                   20 |             |
| accounts home bridge month           |        14 |                   17 |             |
| accounts expenses daily year         |        13 |                   14 |             |
| accounts expenses deltas year        |        10 |                   12 |             |
| accounts expenses deltas month       |       7.2 |                  7.7 |             |
| accounts home worth month            |       6.5 |                  7.6 |             |
| accounts expenses daily month        |       6.3 |                  7.0 |             |
| transactions of an account           |       5.9 |                  7.1 |             |
| groups candidates in newest          |       5.5 |                  6.3 |             |
| transactions postings of an account  |       5.3 |                  7.5 |             |
| accounts liabilities deltas month    |       4.8 |                  8.4 |             |
| accounts liabilities deltas year     |       4.5 |                  5.1 |             |
| accounts index alone                 |       4.5 |                  5.7 |             |
| accounts income deltas year          |       4.4 |                  4.6 |             |
| groups in oldest                     |       4.4 |                  4.5 |             |
| accounts income deltas month         |       4.2 |                  4.4 |             |
| accounts income deltas all           |       4.0 |                  4.7 |             |
| accounts liabilities deltas all      |       3.9 |                  4.6 |             |
| transactions by description          |       3.6 |                  3.6 |             |
| groups in newest                     |       2.8 |                  3.2 |             |
| transactions newest                  |       2.7 |                  4.5 |             |
| transactions postings by description |       2.5 |                  2.7 |             |
| transactions deep page               |       2.4 |                  2.6 |             |
| transactions last month              |       2.4 |                  2.8 |             |
| accounts lots                        |       1.3 |                  1.6 |             |
| files list files                     |       1.2 |                  1.4 |             |
| transactions postings newest         |       1.2 |                  1.2 |             |
| accounts tree                        |       0.6 |                  0.9 |             |
| files aside find transaction files   |       0.4 |                  0.5 |             |
| files read newest                    |       0.2 |                  0.3 |             |

## fifty-years

| case                                 | mean (ms) | 99th percentile (ms) | mark        |
| ------------------------------------ | --------: | -------------------: | ----------- |
| accounts drops all                   |       283 |                  316 | over 150 ms |
| files edit oldest                    |       234 |                  257 | over 150 ms |
| accounts returns all                 |       183 |                  194 | over 150 ms |
| accounts home bridge all             |       156 |                  163 | over 150 ms |
| accounts invested 5y                 |       140 |                  154 |             |
| accounts invested all                |       133 |                  149 |             |
| accounts income invested all         |       127 |                  134 |             |
| files edit newest                    |       106 |                  115 |             |
| groups candidates in oldest          |        86 |                   90 |             |
| accounts home worth all              |        82 |                   99 |             |
| accounts drops 10y                   |        75 |                   78 |             |
| accounts returns year                |        70 |                   73 |             |
| accounts returns month               |        67 |                   70 |             |
| files statement find latest file     |        65 |                   67 |             |
| accounts home worth 5y               |        64 |                   88 |             |
| accounts invested 10y                |        62 |                   76 |             |
| files import 100                     |        62 |                   66 |             |
| accounts income invested year        |        60 |                   61 |             |
| accounts invested year               |        59 |                   62 |             |
| accounts checks                      |        59 |                   62 |             |
| accounts expenses daily all          |        54 |                   56 |             |
| accounts drops 5y                    |        52 |                   55 |             |
| accounts income invested month       |        48 |                   50 |             |
| accounts invested month              |        48 |                   51 |             |
| accounts home bridge 10y             |        42 |                   44 |             |
| accounts holdings all                |        35 |                   43 |             |
| accounts holdings year               |        34 |                   39 |             |
| accounts holdings month              |        33 |                   39 |             |
| accounts expenses deltas all         |        32 |                   33 |             |
| accounts home bridge 5y              |        31 |                   32 |             |
| accounts drops year                  |        30 |                   39 |             |
| accounts drops month                 |        27 |                   35 |             |
| accounts home worth year             |        25 |                  106 |             |
| accounts home bridge year            |        17 |                   20 |             |
| transactions of an account           |        16 |                   17 |             |
| accounts home bridge month           |        15 |                   16 |             |
| accounts home worth 10y              |        14 |                   16 |             |
| accounts expenses daily year         |        13 |                   14 |             |
| accounts expenses deltas year        |        11 |                   12 |             |
| accounts liabilities deltas year     |        11 |                   62 |             |
| accounts expenses deltas month       |       9.2 |                   11 |             |
| groups candidates in newest          |       8.5 |                  9.2 |             |
| accounts expenses daily month        |       7.2 |                  7.3 |             |
| transactions postings of an account  |       6.8 |                  8.3 |             |
| accounts home worth month            |       6.8 |                  8.0 |             |
| accounts index alone                 |       5.2 |                  6.3 |             |
| accounts income deltas year          |       5.0 |                  6.3 |             |
| accounts income deltas all           |       4.9 |                  5.7 |             |
| accounts liabilities deltas month    |       4.8 |                  6.6 |             |
| groups in oldest                     |       4.6 |                  5.8 |             |
| accounts income deltas month         |       4.6 |                  5.4 |             |
| accounts liabilities deltas all      |       4.3 |                  5.6 |             |
| transactions by description          |       3.3 |                  4.9 |             |
| groups in newest                     |       3.1 |                  3.5 |             |
| transactions deep page               |       3.1 |                  5.0 |             |
| transactions newest                  |       2.6 |                  3.2 |             |
| transactions last month              |       2.4 |                  2.5 |             |
| files list files                     |       2.3 |                  4.7 |             |
| transactions postings by description |       2.1 |                  4.1 |             |
| accounts lots                        |       1.4 |                  1.6 |             |
| transactions postings newest         |       1.3 |                  1.3 |             |
| accounts tree                        |       0.6 |                  1.5 |             |
| files aside find transaction files   |       0.4 |                  0.5 |             |
| files read newest                    |       0.3 |                  0.4 |             |

## wide

| case                                 | mean (ms) | 99th percentile (ms) | mark        |
| ------------------------------------ | --------: | -------------------: | ----------- |
| accounts invested 5y                 |       328 |                  341 | over 150 ms |
| accounts drops 10y                   |       185 |                  209 | over 150 ms |
| accounts drops all                   |       179 |                  188 | over 150 ms |
| accounts home worth 5y               |       166 |                  183 | over 150 ms |
| groups candidates in oldest          |       135 |                  137 |             |
| accounts drops 5y                    |       105 |                  114 |             |
| files edit oldest                    |       100 |                  102 |             |
| accounts home bridge all             |        97 |                  105 |             |
| accounts home bridge 10y             |        97 |                  105 |             |
| files import 100                     |        83 |                   88 |             |
| files edit newest                    |        78 |                   88 |             |
| accounts expenses daily all          |        71 |                   72 |             |
| accounts income invested year        |        70 |                   84 |             |
| accounts invested year               |        68 |                   85 |             |
| accounts home bridge 5y              |        68 |                   78 |             |
| accounts returns all                 |        55 |                   59 |             |
| accounts invested 10y                |        53 |                   63 |             |
| accounts invested all                |        51 |                   58 |             |
| accounts income invested all         |        50 |                   60 |             |
| accounts expenses deltas all         |        44 |                   45 |             |
| accounts home bridge year            |        39 |                   41 |             |
| accounts returns year                |        33 |                   35 |             |
| accounts home worth 10y              |        32 |                   48 |             |
| accounts returns month               |        31 |                   33 |             |
| accounts home worth all              |        31 |                   40 |             |
| accounts home worth year             |        30 |                   32 |             |
| accounts home bridge month           |        29 |                   31 |             |
| accounts invested month              |        29 |                   41 |             |
| accounts drops year                  |        28 |                   31 |             |
| accounts income invested month       |        28 |                   28 |             |
| accounts expenses deltas year        |        27 |                   29 |             |
| accounts holdings year               |        22 |                   30 |             |
| accounts holdings month              |        20 |                   22 |             |
| accounts holdings all                |        20 |                   21 |             |
| accounts expenses daily year         |        19 |                   20 |             |
| accounts drops month                 |        18 |                   19 |             |
| accounts expenses deltas month       |        14 |                   15 |             |
| accounts expenses daily month        |        12 |                   13 |             |
| accounts checks                      |        12 |                   16 |             |
| accounts home worth month            |        12 |                   14 |             |
| files statement find latest file     |       8.0 |                  9.1 |             |
| accounts index alone                 |       7.7 |                  9.2 |             |
| accounts liabilities deltas year     |       7.3 |                  9.4 |             |
| accounts income deltas year          |       6.6 |                  7.6 |             |
| accounts liabilities deltas month    |       6.6 |                  7.4 |             |
| accounts income deltas month         |       6.1 |                  7.1 |             |
| transactions by description          |       5.8 |                  7.9 |             |
| accounts liabilities deltas all      |       5.4 |                  6.9 |             |
| accounts income deltas all           |       5.4 |                  6.2 |             |
| transactions postings by description |       4.6 |                  4.7 |             |
| files list files                     |       3.8 |                  5.1 |             |
| transactions deep page               |       2.7 |                  4.4 |             |
| groups in oldest                     |       2.6 |                  2.9 |             |
| transactions newest                  |       2.6 |                  2.9 |             |
| transactions last month              |       2.4 |                  2.5 |             |
| groups in newest                     |       2.4 |                  2.7 |             |
| transactions of an account           |       2.3 |                  2.9 |             |
| accounts tree                        |       1.9 |                  2.3 |             |
| accounts lots                        |       1.4 |                  1.7 |             |
| transactions postings newest         |       1.3 |                  1.5 |             |
| groups candidates in newest          |       0.9 |                  1.0 |             |
| transactions postings of an account  |       0.9 |                  0.9 |             |
| files aside find transaction files   |       0.4 |                  0.5 |             |
| files read newest                    |       0.2 |                  0.2 |             |

## Still over 150 ms

On twenty-years: files edit oldest.

On fifty-years: accounts drops all, files edit oldest, accounts returns all, accounts home bridge all.

On wide: accounts invested 5y, accounts drops 10y, accounts drops all, accounts home worth 5y.
