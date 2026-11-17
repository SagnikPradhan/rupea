# Benchmarks

Every request has 300 ms: 150 ms on the server and 150 ms on the network. The target is a mean under 150 ms for each case, with the 99th percentile shown beside it. The gate applies to every case a web page calls, and it is recorded here for people to read: the bench does not fail when a case is over 150 ms.

Run all benchmarks with `pnpm --filter @rupea/server bench`, which takes about 6 minutes. Add a file name, such as `pnpm --filter @rupea/server bench application-accounts`, to run one area. Each case is an application-level call, measured before transport.

The numbers below come from 2026-11-17 on an AMD Ryzen 5 5600X (6 cores, 12 threads) with 15 GB RAM on Linux, using embedded Postgres from portable-pg. Each case has 10 samples. Times are in milliseconds. Later steps update this file.

## twenty-years

| case                                 | mean (ms) | 99th percentile (ms) | mark        |
| ------------------------------------ | --------: | -------------------: | ----------- |
| files edit oldest                    |       182 |                  200 | over 150 ms |
| accounts drops all                   |       117 |                  127 |             |
| files edit newest                    |       113 |                  129 |             |
| accounts returns all                 |       101 |                  106 |             |
| accounts invested 5y                 |        70 |                   73 |             |
| accounts drops 10y                   |        67 |                   71 |             |
| files import 100                     |        62 |                   65 |             |
| groups candidates in oldest          |        55 |                   56 |             |
| accounts home bridge all             |        53 |                   62 |             |
| accounts home worth 5y               |        48 |                   49 |             |
| accounts expenses daily all          |        46 |                   48 |             |
| accounts drops 5y                    |        42 |                   45 |             |
| accounts returns year                |        40 |                   41 |             |
| accounts income invested all         |        40 |                   42 |             |
| accounts invested all                |        39 |                   42 |             |
| accounts invested 10y                |        38 |                   39 |             |
| files statement find latest file     |        37 |                   40 |             |
| accounts home bridge 10y             |        35 |                   38 |             |
| accounts invested year               |        35 |                   52 |             |
| accounts income invested year        |        33 |                   35 |             |
| accounts income invested month       |        27 |                   28 |             |
| accounts invested month              |        27 |                   30 |             |
| accounts home bridge 5y              |        27 |                   32 |             |
| accounts holdings month              |        25 |                   26 |             |
| accounts holdings all                |        24 |                   26 |             |
| accounts holdings year               |        24 |                   25 |             |
| accounts home worth all              |        22 |                   24 |             |
| accounts returns month               |        21 |                   22 |             |
| accounts drops year                  |        20 |                   21 |             |
| accounts home bridge year            |        20 |                   21 |             |
| accounts drops month                 |        18 |                   19 |             |
| accounts home bridge month           |        16 |                   17 |             |
| accounts checks                      |        15 |                   17 |             |
| accounts expenses deltas all         |        15 |                   16 |             |
| accounts home worth 10y              |        14 |                   25 |             |
| accounts home worth year             |        12 |                   13 |             |
| accounts expenses daily year         |        11 |                   12 |             |
| accounts expenses deltas year        |        10 |                   13 |             |
| accounts home worth month            |       6.5 |                   11 |             |
| accounts expenses deltas month       |       6.4 |                  6.8 |             |
| transactions of an account           |       5.9 |                  7.1 |             |
| accounts expenses daily month        |       5.8 |                  6.2 |             |
| groups candidates in newest          |       5.5 |                  6.3 |             |
| accounts liabilities deltas year     |       5.4 |                  6.4 |             |
| transactions postings of an account  |       5.3 |                  7.5 |             |
| accounts income deltas year          |       4.7 |                  5.6 |             |
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
| accounts drops all                   |       279 |                  309 | over 150 ms |
| files edit oldest                    |       234 |                  257 | over 150 ms |
| accounts returns all                 |       188 |                  208 | over 150 ms |
| accounts home bridge all             |       114 |                  117 |             |
| files edit newest                    |       106 |                  115 |             |
| accounts income invested all         |       103 |                  112 |             |
| accounts invested all                |       100 |                  111 |             |
| groups candidates in oldest          |        86 |                   90 |             |
| accounts invested 5y                 |        77 |                   94 |             |
| accounts drops 10y                   |        75 |                   85 |             |
| accounts home worth all              |        73 |                   82 |             |
| files statement find latest file     |        65 |                   67 |             |
| files import 100                     |        62 |                   66 |             |
| accounts checks                      |        59 |                   61 |             |
| accounts expenses daily all          |        51 |                   54 |             |
| accounts drops 5y                    |        50 |                   52 |             |
| accounts home worth 5y               |        48 |                   61 |             |
| accounts invested 10y                |        45 |                   47 |             |
| accounts invested year               |        41 |                   60 |             |
| accounts income invested year        |        40 |                   43 |             |
| accounts home bridge 10y             |        38 |                   40 |             |
| accounts invested month              |        34 |                   42 |             |
| accounts income invested month       |        33 |                   35 |             |
| accounts home bridge 5y              |        30 |                   31 |             |
| accounts returns year                |        29 |                   30 |             |
| accounts expenses deltas all         |        29 |                   31 |             |
| accounts drops year                  |        28 |                   29 |             |
| accounts holdings all                |        27 |                   31 |             |
| accounts holdings month              |        26 |                   28 |             |
| accounts holdings year               |        26 |                   28 |             |
| accounts returns month               |        25 |                   27 |             |
| accounts drops month                 |        25 |                   27 |             |
| accounts home bridge year            |        23 |                   24 |             |
| accounts home bridge month           |        20 |                   22 |             |
| transactions of an account           |        16 |                   17 |             |
| accounts home worth 10y              |        13 |                   15 |             |
| accounts home worth year             |        12 |                   14 |             |
| accounts expenses daily year         |        11 |                   13 |             |
| accounts expenses deltas year        |        11 |                   12 |             |
| groups candidates in newest          |       8.5 |                  9.2 |             |
| accounts expenses deltas month       |       8.2 |                  8.6 |             |
| accounts expenses daily month        |       7.2 |                  8.1 |             |
| transactions postings of an account  |       6.8 |                  8.3 |             |
| accounts home worth month            |       6.7 |                  8.0 |             |
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

| case                                 | mean (ms) | 99th percentile (ms) | mark        |
| ------------------------------------ | --------: | -------------------: | ----------- |
| accounts drops all                   |       180 |                  191 | over 150 ms |
| accounts drops 10y                   |       180 |                  195 | over 150 ms |
| accounts invested 5y                 |       148 |                  170 |             |
| groups candidates in oldest          |       135 |                  137 |             |
| accounts home worth 5y               |       105 |                  117 |             |
| accounts drops 5y                    |       103 |                  114 |             |
| files edit oldest                    |       100 |                  102 |             |
| files import 100                     |        83 |                   88 |             |
| files edit newest                    |        78 |                   88 |             |
| accounts home bridge 10y             |        73 |                   77 |             |
| accounts home bridge all             |        72 |                   79 |             |
| accounts returns all                 |        64 |                   69 |             |
| accounts expenses daily all          |        60 |                   64 |             |
| accounts home bridge 5y              |        56 |                   63 |             |
| accounts home bridge year            |        41 |                   50 |             |
| accounts expenses deltas all         |        39 |                   40 |             |
| accounts returns year                |        39 |                   41 |             |
| accounts income invested year        |        38 |                   42 |             |
| accounts returns month               |        38 |                   41 |             |
| accounts invested all                |        37 |                   46 |             |
| accounts invested 10y                |        35 |                   39 |             |
| accounts income invested all         |        35 |                   37 |             |
| accounts invested year               |        34 |                   36 |             |
| accounts home bridge month           |        31 |                   32 |             |
| accounts expenses deltas year        |        30 |                   37 |             |
| accounts drops year                  |        27 |                   28 |             |
| accounts home worth 10y              |        25 |                   34 |             |
| accounts home worth all              |        23 |                   25 |             |
| accounts home worth year             |        21 |                   23 |             |
| accounts income invested month       |        20 |                   21 |             |
| accounts invested month              |        20 |                   21 |             |
| accounts expenses daily year         |        19 |                   21 |             |
| accounts drops month                 |        18 |                   19 |             |
| accounts holdings month              |        18 |                   22 |             |
| accounts holdings all                |        17 |                   18 |             |
| accounts holdings year               |        17 |                   19 |             |
| accounts expenses deltas month       |        14 |                   15 |             |
| accounts expenses daily month        |        13 |                   13 |             |
| accounts checks                      |        12 |                   13 |             |
| accounts home worth month            |       9.9 |                   11 |             |
| files statement find latest file     |       8.0 |                  9.1 |             |
| accounts index alone                 |       7.5 |                  8.5 |             |
| accounts income deltas year          |       7.1 |                  8.7 |             |
| accounts liabilities deltas year     |       7.0 |                  8.1 |             |
| accounts liabilities deltas month    |       6.4 |                  7.0 |             |
| accounts income deltas month         |       6.0 |                  6.6 |             |
| transactions by description          |       5.8 |                  7.9 |             |
| accounts income deltas all           |       5.4 |                  6.3 |             |
| accounts liabilities deltas all      |       5.4 |                  6.4 |             |
| transactions postings by description |       4.6 |                  4.7 |             |
| files list files                     |       3.8 |                  5.1 |             |
| transactions deep page               |       2.7 |                  4.4 |             |
| groups in oldest                     |       2.6 |                  2.9 |             |
| transactions newest                  |       2.6 |                  2.9 |             |
| transactions last month              |       2.4 |                  2.5 |             |
| groups in newest                     |       2.4 |                  2.7 |             |
| transactions of an account           |       2.3 |                  2.9 |             |
| accounts tree                        |       1.9 |                  2.4 |             |
| accounts lots                        |       1.4 |                  1.9 |             |
| transactions postings newest         |       1.3 |                  1.5 |             |
| groups candidates in newest          |       0.9 |                  1.0 |             |
| transactions postings of an account  |       0.9 |                  0.9 |             |
| files aside find transaction files   |       0.4 |                  0.5 |             |
| files read newest                    |       0.2 |                  0.2 |             |

## Still over 150 ms

On twenty-years: files edit oldest.

On fifty-years: accounts drops all, files edit oldest, accounts returns all.

On wide: accounts drops all, accounts drops 10y.
