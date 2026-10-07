/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/depth.json`.
 */
export type Depth = {
  "address": "5cE5Kc42mwvg931PfNfs224RuBr47JRk3VqgTSyEV7MS",
  "metadata": {
    "name": "depth",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Depth confidential perpetual trading program"
  },
  "instructions": [
    {
      "name": "activateMarket",
      "discriminator": [
        10,
        26,
        197,
        116,
        113,
        99,
        72,
        89
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "backstopOffer"
        },
        {
          "name": "vault",
          "relations": [
            "protocol"
          ]
        }
      ],
      "args": [
        {
          "name": "insurance",
          "type": "u64"
        },
        {
          "name": "salt",
          "type": "u128"
        }
      ]
    },
    {
      "name": "beginAllocation",
      "discriminator": [
        171,
        254,
        207,
        130,
        247,
        228,
        33,
        196
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "transfer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  45,
                  116,
                  114,
                  97,
                  110,
                  115,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "beginQuoteReplacement",
      "discriminator": [
        88,
        157,
        7,
        153,
        161,
        129,
        0,
        212
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "grant",
          "optional": true
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "quote.market",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "successorNonce",
          "type": "u64"
        }
      ]
    },
    {
      "name": "beginRelease",
      "discriminator": [
        133,
        115,
        33,
        81,
        150,
        188,
        57,
        122
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "transfer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  45,
                  116,
                  114,
                  97,
                  110,
                  115,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelCredit",
      "discriminator": [
        51,
        31,
        159,
        142,
        223,
        22,
        17,
        151
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "receipt.nonce",
                "account": "depositReceipt"
              }
            ]
          }
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelFeeClaim",
      "discriminator": [
        115,
        53,
        166,
        22,
        210,
        138,
        62,
        232
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "protocolBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "protocol.authority",
                "account": "protocol"
              }
            ]
          }
        },
        {
          "name": "appBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "order.app",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelFreeCredit",
      "discriminator": [
        154,
        93,
        83,
        17,
        44,
        11,
        56,
        119
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "transfer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  45,
                  116,
                  114,
                  97,
                  110,
                  115,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "transfer.nonce",
                "account": "marginTransfer"
              }
            ]
          }
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelFreeDebit",
      "discriminator": [
        140,
        77,
        4,
        95,
        106,
        157,
        226,
        156
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "transfer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  45,
                  116,
                  114,
                  97,
                  110,
                  115,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "transfer.nonce",
                "account": "marginTransfer"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelInsuranceCredit",
      "discriminator": [
        12,
        237,
        66,
        182,
        101,
        130,
        66,
        18
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "receipt.nonce",
                "account": "depositReceipt"
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "clearing.market",
                "account": "clearingAccount"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelLiquidation",
      "discriminator": [
        99,
        162,
        9,
        240,
        112,
        37,
        117,
        242
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "targetAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "backstopAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.maker",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelMarketCredit",
      "discriminator": [
        136,
        60,
        51,
        122,
        52,
        73,
        121,
        217
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "transfer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  45,
                  116,
                  114,
                  97,
                  110,
                  115,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "transfer.nonce",
                "account": "marginTransfer"
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "transfer.market",
                "account": "marginTransfer"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelMarketDebit",
      "discriminator": [
        48,
        82,
        3,
        49,
        171,
        204,
        50,
        131
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market_account.market",
                "account": "marketAccount"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "transfer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  45,
                  116,
                  114,
                  97,
                  110,
                  115,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "transfer.nonce",
                "account": "marginTransfer"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelOpenBalance",
      "discriminator": [
        208,
        173,
        23,
        56,
        142,
        220,
        217,
        47
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelOpenClearing",
      "discriminator": [
        207,
        252,
        32,
        79,
        228,
        77,
        106,
        62
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "clearing.market",
                "account": "clearingAccount"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelOpenMarket",
      "discriminator": [
        30,
        117,
        165,
        171,
        39,
        14,
        79,
        63
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market_account.market",
                "account": "marketAccount"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelOrder",
      "discriminator": [
        95,
        129,
        237,
        240,
        8,
        49,
        223,
        132
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelPreparedQuote",
      "discriminator": [
        156,
        45,
        214,
        157,
        168,
        234,
        178,
        104
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "grant",
          "optional": true
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "quote.market",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelQuoteRelease",
      "discriminator": [
        207,
        94,
        139,
        183,
        219,
        21,
        16,
        156
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "grant",
          "optional": true
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "quote.market",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "quote.market",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelQuoteReserve",
      "discriminator": [
        179,
        149,
        206,
        224,
        116,
        57,
        36,
        109
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "grant",
          "optional": true
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "quote.market",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "quote.market",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelTrade",
      "discriminator": [
        124,
        66,
        91,
        59,
        175,
        107,
        208,
        120
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "traderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "makerAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              }
            ]
          }
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelWithdrawal",
      "discriminator": [
        183,
        104,
        181,
        250,
        28,
        128,
        210,
        70
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "receipt"
          ]
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          },
          "relations": [
            "receipt"
          ]
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  116,
                  104,
                  100,
                  114,
                  97,
                  119,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "balance"
              },
              {
                "kind": "account",
                "path": "receipt.nonce",
                "account": "withdrawalReceipt"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "claimTradeFees",
      "discriminator": [
        244,
        71,
        63,
        241,
        69,
        151,
        185,
        214
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "protocolBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "protocol_balance.owner",
                "account": "balanceAccount"
              }
            ]
          }
        },
        {
          "name": "appBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "order.app",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimTradeFeesCallback",
      "discriminator": [
        138,
        82,
        173,
        63,
        59,
        44,
        229,
        57
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "protocolBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "protocol.authority",
                "account": "protocol"
              }
            ]
          }
        },
        {
          "name": "appBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "order.app",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "claimTradeFeesOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "claimWinddown",
      "discriminator": [
        4,
        135,
        120,
        14,
        129,
        107,
        100,
        96
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "winddown",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  100,
                  100,
                  111,
                  119,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "claim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  100,
                  100,
                  111,
                  119,
                  110,
                  45,
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "marketAccount"
              }
            ]
          }
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimWinddownAppFee",
      "discriminator": [
        38,
        11,
        228,
        185,
        70,
        112,
        91,
        41
      ],
      "accounts": [
        {
          "name": "app",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "winddown",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  100,
                  100,
                  111,
                  119,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "claim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  100,
                  100,
                  111,
                  119,
                  110,
                  45,
                  102,
                  101,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "claim.order",
                "account": "winddownFeeClaim"
              }
            ]
          }
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimWinddownProtocolFees",
      "discriminator": [
        191,
        169,
        230,
        29,
        134,
        62,
        147,
        203
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "winddown",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  100,
                  100,
                  111,
                  119,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "closeBackstop",
      "discriminator": [
        230,
        210,
        233,
        22,
        176,
        102,
        67,
        143
      ],
      "accounts": [
        {
          "name": "maker",
          "writable": true,
          "signer": true
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  99,
                  107,
                  115,
                  116,
                  111,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "offer.market",
                "account": "backstopOffer"
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "account",
                "path": "offer.nonce",
                "account": "backstopOffer"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closeBalanceView",
      "discriminator": [
        116,
        148,
        175,
        248,
        157,
        34,
        83,
        156
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "view",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  105,
                  101,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "view.nonce",
                "account": "balanceView"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closeFillView",
      "discriminator": [
        4,
        232,
        77,
        193,
        183,
        44,
        17,
        250
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "view",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  105,
                  108,
                  108,
                  45,
                  118,
                  105,
                  101,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "view.order",
                "account": "fillView"
              },
              {
                "kind": "account",
                "path": "view.owner",
                "account": "fillView"
              },
              {
                "kind": "account",
                "path": "view.nonce",
                "account": "fillView"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closeMarketView",
      "discriminator": [
        238,
        128,
        242,
        162,
        41,
        215,
        182,
        246
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "view",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  118,
                  105,
                  101,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "view.market_account",
                "account": "marketView"
              },
              {
                "kind": "account",
                "path": "view.nonce",
                "account": "marketView"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closeQuote",
      "discriminator": [
        186,
        237,
        233,
        160,
        4,
        175,
        58,
        111
      ],
      "accounts": [
        {
          "name": "maker",
          "writable": true,
          "signer": true
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "quote.market",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closeQuoteView",
      "discriminator": [
        196,
        155,
        137,
        78,
        85,
        100,
        231,
        203
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "view",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  45,
                  118,
                  105,
                  101,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "view.quote",
                "account": "quoteView"
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "view.nonce",
                "account": "quoteView"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "quoteQueue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  45,
                  113,
                  117,
                  101,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "recoveryConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  118,
                  101,
                  114,
                  121,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "config",
          "type": {
            "defined": {
              "name": "marketConfig"
            }
          }
        },
        {
          "name": "oracleAccount",
          "type": "pubkey"
        },
        {
          "name": "recoveryKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "recoverySigners",
          "type": {
            "array": [
              "pubkey",
              5
            ]
          }
        }
      ]
    },
    {
      "name": "creditBalanceCallback",
      "discriminator": [
        100,
        187,
        110,
        118,
        160,
        188,
        196,
        23
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "receipt.owner",
                "account": "depositReceipt"
              },
              {
                "kind": "account",
                "path": "receipt.nonce",
                "account": "depositReceipt"
              }
            ]
          }
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "balance.owner",
                "account": "balanceAccount"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "creditBalanceOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "creditDeposit",
      "discriminator": [
        4,
        82,
        10,
        16,
        162,
        151,
        85,
        226
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "receipt.owner",
                "account": "depositReceipt"
              },
              {
                "kind": "account",
                "path": "receipt.nonce",
                "account": "depositReceipt"
              }
            ]
          }
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "receipt.owner",
                "account": "depositReceipt"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "creditFreeCallback",
      "discriminator": [
        181,
        38,
        130,
        31,
        44,
        88,
        84,
        59
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "transfer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  45,
                  116,
                  114,
                  97,
                  110,
                  115,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "transfer.owner",
                "account": "marginTransfer"
              },
              {
                "kind": "account",
                "path": "transfer.nonce",
                "account": "marginTransfer"
              }
            ]
          }
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "balance.owner",
                "account": "balanceAccount"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "creditFreeOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "creditInsurance",
      "discriminator": [
        110,
        90,
        170,
        112,
        225,
        16,
        138,
        195
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "receipt.nonce",
                "account": "depositReceipt"
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "creditInsuranceCallback",
      "discriminator": [
        3,
        253,
        152,
        122,
        219,
        245,
        247,
        193
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "receipt.owner",
                "account": "depositReceipt"
              },
              {
                "kind": "account",
                "path": "receipt.nonce",
                "account": "depositReceipt"
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "clearing.market",
                "account": "clearingAccount"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "creditInsuranceOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "creditMarketCallback",
      "discriminator": [
        166,
        211,
        5,
        13,
        11,
        16,
        161,
        145
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "transfer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  45,
                  116,
                  114,
                  97,
                  110,
                  115,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "transfer.owner",
                "account": "marginTransfer"
              },
              {
                "kind": "account",
                "path": "transfer.nonce",
                "account": "marginTransfer"
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market_account.market",
                "account": "marketAccount"
              },
              {
                "kind": "account",
                "path": "market_account.owner",
                "account": "marketAccount"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "creditMarketOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "debitBalanceCallback",
      "discriminator": [
        165,
        230,
        154,
        5,
        231,
        198,
        3,
        232
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "destination",
          "writable": true,
          "relations": [
            "receipt"
          ]
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "balance.owner",
                "account": "balanceAccount"
              }
            ]
          },
          "relations": [
            "receipt"
          ]
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  116,
                  104,
                  100,
                  114,
                  97,
                  119,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "balance"
              },
              {
                "kind": "account",
                "path": "receipt.nonce",
                "account": "withdrawalReceipt"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "debitBalanceOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "debitFreeCallback",
      "discriminator": [
        235,
        80,
        121,
        192,
        245,
        13,
        94,
        211
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "balance.owner",
                "account": "balanceAccount"
              }
            ]
          }
        },
        {
          "name": "transfer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  45,
                  116,
                  114,
                  97,
                  110,
                  115,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "transfer.owner",
                "account": "marginTransfer"
              },
              {
                "kind": "account",
                "path": "transfer.nonce",
                "account": "marginTransfer"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "debitFreeOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "debitMarketV2Callback",
      "discriminator": [
        94,
        45,
        158,
        51,
        177,
        223,
        253,
        170
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market_account.market",
                "account": "marketAccount"
              },
              {
                "kind": "account",
                "path": "market_account.owner",
                "account": "marketAccount"
              }
            ]
          }
        },
        {
          "name": "transfer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  45,
                  116,
                  114,
                  97,
                  110,
                  115,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "transfer.owner",
                "account": "marginTransfer"
              },
              {
                "kind": "account",
                "path": "transfer.nonce",
                "account": "marginTransfer"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "debitMarketV2Output"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "source",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "enqueueQuote",
      "discriminator": [
        208,
        90,
        62,
        94,
        54,
        230,
        104,
        27
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "quoteQueue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  45,
                  113,
                  117,
                  101,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "grant",
          "optional": true
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "finalizeWinddown",
      "discriminator": [
        203,
        194,
        140,
        189,
        39,
        21,
        14,
        33
      ],
      "accounts": [
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "winddown",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  100,
                  100,
                  111,
                  119,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "vault",
          "relations": [
            "protocol"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "grantOperator",
      "discriminator": [
        200,
        86,
        157,
        171,
        113,
        109,
        157,
        195
      ],
      "accounts": [
        {
          "name": "maker",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "maker"
              }
            ]
          }
        },
        {
          "name": "operator"
        },
        {
          "name": "grant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "account",
                "path": "operator"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "maxCapacity",
          "type": "u64"
        },
        {
          "name": "expiresAt",
          "type": "i64"
        },
        {
          "name": "canView",
          "type": "bool"
        }
      ]
    },
    {
      "name": "initClaimTradeFeesCompDef",
      "discriminator": [
        250,
        220,
        184,
        119,
        58,
        140,
        67,
        136
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initCreditBalanceCompDef",
      "discriminator": [
        187,
        87,
        101,
        72,
        82,
        26,
        5,
        1
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initCreditFreeCompDef",
      "discriminator": [
        85,
        195,
        160,
        92,
        125,
        16,
        247,
        250
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initCreditInsuranceCompDef",
      "discriminator": [
        62,
        217,
        29,
        146,
        28,
        173,
        113,
        254
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initCreditMarketCompDef",
      "discriminator": [
        82,
        159,
        153,
        40,
        121,
        63,
        125,
        66
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initDebitBalanceCompDef",
      "discriminator": [
        0,
        137,
        207,
        201,
        147,
        190,
        43,
        48
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initDebitFreeCompDef",
      "discriminator": [
        100,
        116,
        186,
        38,
        107,
        82,
        98,
        235
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initDebitMarketCompDef",
      "discriminator": [
        48,
        103,
        56,
        72,
        136,
        86,
        14,
        93
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initLiquidateCompDef",
      "discriminator": [
        173,
        194,
        178,
        252,
        128,
        111,
        75,
        5
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initMatchOrderCompDef",
      "discriminator": [
        85,
        62,
        236,
        175,
        167,
        117,
        54,
        194
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initOfferBackstopCompDef",
      "discriminator": [
        171,
        103,
        122,
        168,
        166,
        191,
        3,
        51
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initOpenBalanceCompDef",
      "discriminator": [
        168,
        186,
        62,
        147,
        165,
        20,
        91,
        138
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initOpenClearingCompDef",
      "discriminator": [
        249,
        81,
        155,
        92,
        30,
        222,
        246,
        236
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initOpenMarketCompDef",
      "discriminator": [
        92,
        72,
        220,
        141,
        186,
        238,
        25,
        88
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initPrepareQuoteCompDef",
      "discriminator": [
        205,
        150,
        17,
        215,
        19,
        112,
        83,
        184
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initReleaseBackstopCompDef",
      "discriminator": [
        157,
        48,
        96,
        53,
        36,
        116,
        177,
        226
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initReleaseQuoteCompDef",
      "discriminator": [
        126,
        149,
        108,
        144,
        247,
        167,
        20,
        112
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initReserveQuoteCompDef",
      "discriminator": [
        158,
        23,
        164,
        210,
        77,
        111,
        182,
        2
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initSealClearingCompDef",
      "discriminator": [
        216,
        164,
        7,
        188,
        55,
        36,
        245,
        68
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initSealMarketCompDef",
      "discriminator": [
        199,
        171,
        236,
        37,
        39,
        141,
        240,
        86
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initSealTradeFeesCompDef",
      "discriminator": [
        227,
        23,
        242,
        150,
        207,
        155,
        81,
        7
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initSettleTradeCompDef",
      "discriminator": [
        224,
        110,
        197,
        107,
        254,
        28,
        217,
        200
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initViewBalanceCompDef",
      "discriminator": [
        67,
        64,
        184,
        190,
        190,
        200,
        87,
        12
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initViewFillCompDef",
      "discriminator": [
        139,
        93,
        55,
        9,
        169,
        28,
        123,
        185
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initViewMarketCompDef",
      "discriminator": [
        139,
        6,
        135,
        182,
        224,
        110,
        233,
        174
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initViewQuoteCompDef",
      "discriminator": [
        114,
        91,
        186,
        120,
        105,
        189,
        107,
        133
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeProtocol",
      "discriminator": [
        188,
        233,
        252,
        106,
        134,
        146,
        202,
        91
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "program",
          "address": "5cE5Kc42mwvg931PfNfs224RuBr47JRk3VqgTSyEV7MS"
        },
        {
          "name": "programData"
        },
        {
          "name": "settlementMint"
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "liquidate",
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "trade",
          "accounts": [
            {
              "name": "market",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      109,
                      97,
                      114,
                      107,
                      101,
                      116
                    ]
                  },
                  {
                    "kind": "const",
                    "value": [
                      239,
                      13,
                      139,
                      111,
                      218,
                      44,
                      235,
                      164,
                      29,
                      161,
                      93,
                      64,
                      149,
                      209,
                      218,
                      57,
                      42,
                      13,
                      47,
                      142,
                      208,
                      198,
                      199,
                      188,
                      15,
                      76,
                      250,
                      200,
                      194,
                      128,
                      181,
                      109
                    ]
                  }
                ]
              }
            },
            {
              "name": "clearing",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      99,
                      108,
                      101,
                      97,
                      114,
                      105,
                      110,
                      103
                    ]
                  },
                  {
                    "kind": "account",
                    "path": "market"
                  }
                ]
              }
            },
            {
              "name": "targetAccount",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      109,
                      97,
                      114,
                      107,
                      101,
                      116,
                      45,
                      97,
                      99,
                      99,
                      111,
                      117,
                      110,
                      116
                    ]
                  },
                  {
                    "kind": "account",
                    "path": "market"
                  },
                  {
                    "kind": "account",
                    "path": "target_account.owner",
                    "account": "marketAccount"
                  }
                ]
              }
            },
            {
              "name": "backstopAccount",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      109,
                      97,
                      114,
                      107,
                      101,
                      116,
                      45,
                      97,
                      99,
                      99,
                      111,
                      117,
                      110,
                      116
                    ]
                  },
                  {
                    "kind": "account",
                    "path": "market"
                  },
                  {
                    "kind": "account",
                    "path": "backstop_account.owner",
                    "account": "marketAccount"
                  }
                ]
              }
            },
            {
              "name": "offer",
              "writable": true
            }
          ]
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "trade.market",
                "account": "liquidationTrade"
              },
              {
                "kind": "arg",
                "path": "targetOwner"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "targetOwner",
          "type": "pubkey"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "deadline",
          "type": "i64"
        }
      ]
    },
    {
      "name": "liquidateV2Callback",
      "discriminator": [
        174,
        48,
        50,
        243,
        145,
        148,
        105,
        42
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "targetAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "backstopAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.maker",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "liquidateV2Output"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "matchOrderCallback",
      "discriminator": [
        118,
        84,
        201,
        30,
        56,
        54,
        186,
        28
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market_account.market",
                "account": "marketAccount"
              },
              {
                "kind": "account",
                "path": "market_account.owner",
                "account": "marketAccount"
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "order.market",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "feeRecovery",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  45,
                  114,
                  101,
                  99,
                  111,
                  118,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "order"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "matchOrderOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "offerBackstop",
      "discriminator": [
        32,
        100,
        85,
        186,
        208,
        200,
        33,
        186
      ],
      "accounts": [
        {
          "name": "maker",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "maker"
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  99,
                  107,
                  115,
                  116,
                  111,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "capacity",
          "type": "u64"
        },
        {
          "name": "expiry",
          "type": "i64"
        }
      ]
    },
    {
      "name": "offerBackstopV2Callback",
      "discriminator": [
        128,
        88,
        175,
        87,
        196,
        252,
        138,
        143
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "offer.maker",
                "account": "backstopOffer"
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  99,
                  107,
                  115,
                  116,
                  111,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "offer.maker",
                "account": "backstopOffer"
              },
              {
                "kind": "account",
                "path": "offer.nonce",
                "account": "backstopOffer"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "offerBackstopV2Output"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "openBalance",
      "discriminator": [
        65,
        162,
        108,
        176,
        185,
        115,
        235,
        165
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "recoveryKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "openBalanceCallback",
      "discriminator": [
        216,
        88,
        194,
        252,
        233,
        40,
        55,
        220
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "balance.owner",
                "account": "balanceAccount"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "openBalanceOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "openClearing",
      "discriminator": [
        99,
        2,
        234,
        105,
        138,
        126,
        206,
        20
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "recoveryConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  118,
                  101,
                  114,
                  121,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "recoveryKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "openClearingCallback",
      "discriminator": [
        177,
        163,
        107,
        10,
        23,
        64,
        48,
        63
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "clearing.market",
                "account": "clearingAccount"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "openClearingOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "openMarketAccount",
      "discriminator": [
        50,
        21,
        52,
        247,
        59,
        140,
        207,
        172
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "recoveryConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  118,
                  101,
                  114,
                  121,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "recoveryKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "openMarketCallback",
      "discriminator": [
        169,
        41,
        145,
        31,
        179,
        104,
        29,
        100
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "recoveryConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  118,
                  101,
                  114,
                  121,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market_account.market",
                "account": "marketAccount"
              },
              {
                "kind": "account",
                "path": "market_account.owner",
                "account": "marketAccount"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "openMarketOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "pauseMarket",
      "discriminator": [
        216,
        238,
        4,
        164,
        65,
        11,
        162,
        91
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "prepareQuoteCallback",
      "discriminator": [
        79,
        88,
        153,
        178,
        244,
        193,
        27,
        142
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "quote.market",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "prepareQuoteOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "recoverBalance",
      "discriminator": [
        43,
        78,
        105,
        158,
        135,
        30,
        42,
        144
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "salt",
          "type": "u128"
        }
      ]
    },
    {
      "name": "recoverClearing",
      "discriminator": [
        214,
        208,
        216,
        146,
        92,
        154,
        165,
        44
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "insurance",
          "type": "u64"
        },
        {
          "name": "salt",
          "type": "u128"
        }
      ]
    },
    {
      "name": "recoverMarket",
      "discriminator": [
        48,
        227,
        33,
        29,
        36,
        11,
        30,
        229
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "recoveryConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  118,
                  101,
                  114,
                  121,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market_account.market",
                "account": "marketAccount"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "collateral",
          "type": "u64"
        },
        {
          "name": "reserved",
          "type": "u64"
        },
        {
          "name": "position",
          "type": "i64"
        },
        {
          "name": "entryPrice",
          "type": "u64"
        },
        {
          "name": "fundingCheckpoint",
          "type": "i128"
        },
        {
          "name": "salt",
          "type": "u128"
        }
      ]
    },
    {
      "name": "refreshOracle",
      "discriminator": [
        110,
        168,
        158,
        3,
        43,
        46,
        41,
        91
      ],
      "accounts": [
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "priceUpdate"
        }
      ],
      "args": []
    },
    {
      "name": "refundDeposit",
      "discriminator": [
        19,
        19,
        78,
        50,
        187,
        10,
        162,
        229
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "receipt"
          ]
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "receipt.nonce",
                "account": "depositReceipt"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "refundEscrow",
      "discriminator": [
        107,
        186,
        89,
        99,
        26,
        194,
        23,
        204
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "transfer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  45,
                  116,
                  114,
                  97,
                  110,
                  115,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "transfer.nonce",
                "account": "marginTransfer"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "registerApp",
      "discriminator": [
        5,
        248,
        20,
        126,
        12,
        159,
        9,
        242
      ],
      "accounts": [
        {
          "name": "app",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  112,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "app"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "feeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "releaseBackstop",
      "discriminator": [
        68,
        87,
        248,
        89,
        230,
        41,
        175,
        58
      ],
      "accounts": [
        {
          "name": "actor",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "offer.maker",
                "account": "backstopOffer"
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  99,
                  107,
                  115,
                  116,
                  111,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "offer.maker",
                "account": "backstopOffer"
              },
              {
                "kind": "account",
                "path": "offer.nonce",
                "account": "backstopOffer"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "releaseBackstopCallback",
      "discriminator": [
        6,
        30,
        99,
        194,
        164,
        222,
        160,
        177
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "offer.maker",
                "account": "backstopOffer"
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  99,
                  107,
                  115,
                  116,
                  111,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "offer.maker",
                "account": "backstopOffer"
              },
              {
                "kind": "account",
                "path": "offer.nonce",
                "account": "backstopOffer"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "releaseBackstopOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "releaseQuote",
      "discriminator": [
        22,
        249,
        244,
        182,
        43,
        32,
        153,
        21
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "grant",
          "optional": true
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              }
            ]
          }
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "releaseQuoteCallback",
      "discriminator": [
        153,
        25,
        109,
        222,
        222,
        186,
        120,
        4
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market_account.market",
                "account": "marketAccount"
              },
              {
                "kind": "account",
                "path": "market_account.owner",
                "account": "marketAccount"
              }
            ]
          }
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "quote.market",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "releaseQuoteOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "reportIncident",
      "discriminator": [
        126,
        5,
        154,
        89,
        39,
        235,
        130,
        56
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "relations": [
            "protocol"
          ]
        }
      ],
      "args": [
        {
          "name": "incident",
          "type": {
            "defined": {
              "name": "marketIncident"
            }
          }
        }
      ]
    },
    {
      "name": "requestBalanceView",
      "discriminator": [
        245,
        171,
        93,
        150,
        49,
        76,
        155,
        29
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "balance",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "view",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  105,
                  101,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "viewKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "requestFillView",
      "discriminator": [
        31,
        12,
        63,
        191,
        58,
        250,
        115,
        7
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "order",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "order.market",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "grant",
          "optional": true
        },
        {
          "name": "view",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  105,
                  108,
                  108,
                  45,
                  118,
                  105,
                  101,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "order"
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "viewKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "requestMarketView",
      "discriminator": [
        1,
        209,
        202,
        129,
        119,
        247,
        62,
        184
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "grant",
          "optional": true
        },
        {
          "name": "marketAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "market_account.owner",
                "account": "marketAccount"
              }
            ]
          }
        },
        {
          "name": "view",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  118,
                  105,
                  101,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "marketAccount"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "viewKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "requestQuoteView",
      "discriminator": [
        53,
        106,
        202,
        98,
        237,
        177,
        253,
        229
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "grant",
          "optional": true
        },
        {
          "name": "quote",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        },
        {
          "name": "view",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  45,
                  118,
                  105,
                  101,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "quote"
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "viewKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "requestWithdrawal",
      "discriminator": [
        251,
        85,
        121,
        205,
        56,
        201,
        12,
        177
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "destination"
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  116,
                  104,
                  100,
                  114,
                  97,
                  119,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "balance"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "reserveQuote",
      "discriminator": [
        154,
        108,
        232,
        185,
        144,
        233,
        113,
        105
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "grant",
          "optional": true
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              }
            ]
          }
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "reserveQuoteV2Callback",
      "discriminator": [
        57,
        119,
        120,
        17,
        152,
        7,
        244,
        239
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market_account.market",
                "account": "marketAccount"
              },
              {
                "kind": "account",
                "path": "market_account.owner",
                "account": "marketAccount"
              }
            ]
          }
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "quote.market",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "reserveQuoteV2Output"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "resumeMarket",
      "discriminator": [
        198,
        120,
        104,
        87,
        44,
        103,
        108,
        143
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "backstopOffer"
        },
        {
          "name": "vault",
          "relations": [
            "protocol"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "revealWinddown",
      "discriminator": [
        40,
        92,
        144,
        247,
        2,
        86,
        245,
        101
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "winddown",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  100,
                  100,
                  111,
                  119,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "market_account.owner",
                "account": "marketAccount"
              }
            ]
          }
        },
        {
          "name": "claim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  100,
                  100,
                  111,
                  119,
                  110,
                  45,
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "marketAccount"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "collateral",
          "type": "u64"
        },
        {
          "name": "reserved",
          "type": "u64"
        },
        {
          "name": "position",
          "type": "i64"
        },
        {
          "name": "entryPrice",
          "type": "u64"
        },
        {
          "name": "fundingCheckpoint",
          "type": "i128"
        },
        {
          "name": "salt",
          "type": "u128"
        }
      ]
    },
    {
      "name": "revealWinddownFee",
      "discriminator": [
        42,
        83,
        121,
        161,
        114,
        178,
        38,
        180
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "winddown",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  100,
                  100,
                  111,
                  119,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "order",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "feeRecovery",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  45,
                  114,
                  101,
                  99,
                  111,
                  118,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "order"
              }
            ]
          }
        },
        {
          "name": "claim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  100,
                  100,
                  111,
                  119,
                  110,
                  45,
                  102,
                  101,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "order"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "protocolFee",
          "type": "u64"
        },
        {
          "name": "appFee",
          "type": "u64"
        },
        {
          "name": "salt",
          "type": "u128"
        }
      ]
    },
    {
      "name": "reviseMarket",
      "discriminator": [
        87,
        106,
        141,
        169,
        194,
        181,
        5,
        192
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "config",
          "type": {
            "defined": {
              "name": "marketConfig"
            }
          }
        }
      ]
    },
    {
      "name": "revokeOperator",
      "discriminator": [
        185,
        25,
        87,
        77,
        88,
        8,
        30,
        175
      ],
      "accounts": [
        {
          "name": "maker",
          "signer": true
        },
        {
          "name": "grant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "grant.market",
                "account": "operatorGrant"
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "account",
                "path": "grant.operator",
                "account": "operatorGrant"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "sealClearing",
      "discriminator": [
        3,
        89,
        61,
        225,
        105,
        55,
        29,
        238
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "traderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "makerAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.maker",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "sealClearingCallback",
      "discriminator": [
        104,
        94,
        62,
        115,
        205,
        68,
        95,
        66
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "traderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "makerAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.maker",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "source",
          "writable": true
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "sealClearingOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "sealMarket",
      "discriminator": [
        212,
        128,
        80,
        242,
        228,
        169,
        82,
        196
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "traderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "makerAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.maker",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "sealMarketCallback",
      "discriminator": [
        128,
        76,
        110,
        254,
        130,
        111,
        151,
        4
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "traderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "makerAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.maker",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "sealMarketOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "sealTradeFees",
      "discriminator": [
        78,
        72,
        149,
        237,
        176,
        236,
        90,
        67
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "protocolBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "protocol_balance.owner",
                "account": "balanceAccount"
              }
            ]
          }
        },
        {
          "name": "appBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "order.app",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "sealTradeFeesCallback",
      "discriminator": [
        48,
        95,
        206,
        53,
        150,
        179,
        69,
        45
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "protocolBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "protocol.authority",
                "account": "protocol"
              }
            ]
          }
        },
        {
          "name": "appBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "order.app",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "sealTradeFeesOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "setAppFee",
      "discriminator": [
        156,
        43,
        148,
        144,
        1,
        45,
        156,
        14
      ],
      "accounts": [
        {
          "name": "app",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  112,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "app"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "feeBps",
          "type": "u16"
        },
        {
          "name": "active",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setOracleAccount",
      "discriminator": [
        48,
        150,
        176,
        195,
        1,
        223,
        81,
        18
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "priceUpdate"
        }
      ],
      "args": []
    },
    {
      "name": "settleAllocation",
      "discriminator": [
        144,
        161,
        107,
        45,
        193,
        102,
        204,
        105
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "transfer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  45,
                  116,
                  114,
                  97,
                  110,
                  115,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "transfer.owner",
                "account": "marginTransfer"
              },
              {
                "kind": "account",
                "path": "transfer.nonce",
                "account": "marginTransfer"
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "transfer.owner",
                "account": "marginTransfer"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settleRelease",
      "discriminator": [
        225,
        153,
        19,
        79,
        29,
        156,
        32,
        48
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "transfer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  45,
                  116,
                  114,
                  97,
                  110,
                  115,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "transfer.owner",
                "account": "marginTransfer"
              },
              {
                "kind": "account",
                "path": "transfer.nonce",
                "account": "marginTransfer"
              }
            ]
          }
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "transfer.owner",
                "account": "marginTransfer"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settleTrade",
      "discriminator": [
        252,
        176,
        98,
        248,
        73,
        123,
        8,
        157
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "trade",
          "accounts": [
            {
              "name": "market",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      109,
                      97,
                      114,
                      107,
                      101,
                      116
                    ]
                  },
                  {
                    "kind": "const",
                    "value": [
                      239,
                      13,
                      139,
                      111,
                      218,
                      44,
                      235,
                      164,
                      29,
                      161,
                      93,
                      64,
                      149,
                      209,
                      218,
                      57,
                      42,
                      13,
                      47,
                      142,
                      208,
                      198,
                      199,
                      188,
                      15,
                      76,
                      250,
                      200,
                      194,
                      128,
                      181,
                      109
                    ]
                  }
                ]
              }
            },
            {
              "name": "clearing",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      99,
                      108,
                      101,
                      97,
                      114,
                      105,
                      110,
                      103
                    ]
                  },
                  {
                    "kind": "account",
                    "path": "market"
                  }
                ]
              }
            },
            {
              "name": "traderAccount",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      109,
                      97,
                      114,
                      107,
                      101,
                      116,
                      45,
                      97,
                      99,
                      99,
                      111,
                      117,
                      110,
                      116
                    ]
                  },
                  {
                    "kind": "account",
                    "path": "market"
                  },
                  {
                    "kind": "account",
                    "path": "order.trader",
                    "account": "orderRecord"
                  }
                ]
              }
            },
            {
              "name": "makerAccount",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      109,
                      97,
                      114,
                      107,
                      101,
                      116,
                      45,
                      97,
                      99,
                      99,
                      111,
                      117,
                      110,
                      116
                    ]
                  },
                  {
                    "kind": "account",
                    "path": "market"
                  },
                  {
                    "kind": "account",
                    "path": "maker_account.owner",
                    "account": "marketAccount"
                  }
                ]
              }
            },
            {
              "name": "order",
              "writable": true,
              "pda": {
                "seeds": [
                  {
                    "kind": "const",
                    "value": [
                      111,
                      114,
                      100,
                      101,
                      114
                    ]
                  },
                  {
                    "kind": "account",
                    "path": "market"
                  },
                  {
                    "kind": "account",
                    "path": "order.trader",
                    "account": "orderRecord"
                  },
                  {
                    "kind": "account",
                    "path": "order.nonce",
                    "account": "orderRecord"
                  }
                ]
              }
            }
          ]
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settleTradeV2Callback",
      "discriminator": [
        96,
        52,
        6,
        43,
        14,
        139,
        245,
        225
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "clearing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "traderAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "makerAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              }
            ]
          }
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "settleTradeV2Output"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "startWinddown",
      "discriminator": [
        161,
        187,
        245,
        137,
        48,
        29,
        29,
        15
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "recoveryConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  118,
                  101,
                  114,
                  121,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "clearing",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  101,
                  97,
                  114,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "vault",
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "winddown",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  100,
                  100,
                  111,
                  119,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "insurance",
          "type": "u64"
        },
        {
          "name": "openInterest",
          "type": "u64"
        },
        {
          "name": "protocolFees",
          "type": "u64"
        },
        {
          "name": "appFees",
          "type": "u64"
        },
        {
          "name": "salt",
          "type": "u128"
        }
      ]
    },
    {
      "name": "stopQuote",
      "discriminator": [
        111,
        2,
        97,
        166,
        39,
        116,
        187,
        130
      ],
      "accounts": [
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "quoteQueue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  45,
                  113,
                  117,
                  101,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "grant",
          "optional": true
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "submitOrder",
      "discriminator": [
        230,
        150,
        200,
        53,
        92,
        208,
        109,
        108
      ],
      "accounts": [
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "appConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  112,
                  112
                ]
              },
              {
                "kind": "arg",
                "path": "app"
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "app",
          "type": "pubkey"
        },
        {
          "name": "appFeeBps",
          "type": "u16"
        },
        {
          "name": "appFeeVersion",
          "type": "u64"
        },
        {
          "name": "deadline",
          "type": "i64"
        },
        {
          "name": "expectedRevision",
          "type": "u64"
        },
        {
          "name": "expectedOracleTimestamp",
          "type": "i64"
        },
        {
          "name": "ciphertexts",
          "type": {
            "array": [
              {
                "array": [
                  "u8",
                  32
                ]
              },
              2
            ]
          }
        },
        {
          "name": "inputKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "inputNonce",
          "type": "u128"
        }
      ]
    },
    {
      "name": "submitQuote",
      "discriminator": [
        230,
        121,
        122,
        202,
        228,
        6,
        91,
        181
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "marketAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "market_account.owner",
                "account": "marketAccount"
              }
            ]
          }
        },
        {
          "name": "grant",
          "optional": true
        },
        {
          "name": "quote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "market_account.owner",
                "account": "marketAccount"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "capacity",
          "type": "u64"
        },
        {
          "name": "tierCount",
          "type": "u8"
        },
        {
          "name": "expiry",
          "type": "i64"
        },
        {
          "name": "expectedRevision",
          "type": "u64"
        },
        {
          "name": "expectedOracleTimestamp",
          "type": "i64"
        },
        {
          "name": "ciphertexts",
          "type": {
            "array": [
              {
                "array": [
                  "u8",
                  32
                ]
              },
              6
            ]
          }
        },
        {
          "name": "inputKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "inputNonce",
          "type": "u128"
        }
      ]
    },
    {
      "name": "sweepWinddown",
      "discriminator": [
        92,
        57,
        9,
        170,
        122,
        179,
        17,
        178
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "protocol"
          ]
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "const",
                "value": [
                  239,
                  13,
                  139,
                  111,
                  218,
                  44,
                  235,
                  164,
                  29,
                  161,
                  93,
                  64,
                  149,
                  209,
                  218,
                  57,
                  42,
                  13,
                  47,
                  142,
                  208,
                  198,
                  199,
                  188,
                  15,
                  76,
                  250,
                  200,
                  194,
                  128,
                  181,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "winddown",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  100,
                  100,
                  111,
                  119,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "viewBalanceCallback",
      "discriminator": [
        185,
        187,
        98,
        71,
        52,
        153,
        252,
        154
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "balance",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "balance.owner",
                "account": "balanceAccount"
              }
            ]
          }
        },
        {
          "name": "view",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  105,
                  101,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "view.owner",
                "account": "balanceView"
              },
              {
                "kind": "account",
                "path": "view.nonce",
                "account": "balanceView"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "viewBalanceOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "viewFillCallback",
      "discriminator": [
        106,
        226,
        54,
        16,
        186,
        154,
        168,
        97
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "order",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "order.market",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.trader",
                "account": "orderRecord"
              },
              {
                "kind": "account",
                "path": "order.nonce",
                "account": "orderRecord"
              }
            ]
          }
        },
        {
          "name": "view",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  105,
                  108,
                  108,
                  45,
                  118,
                  105,
                  101,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "view.order",
                "account": "fillView"
              },
              {
                "kind": "account",
                "path": "view.owner",
                "account": "fillView"
              },
              {
                "kind": "account",
                "path": "view.nonce",
                "account": "fillView"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "viewFillOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "viewMarketCallback",
      "discriminator": [
        244,
        204,
        166,
        254,
        108,
        66,
        206,
        59
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "marketAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market_account.market",
                "account": "marketAccount"
              },
              {
                "kind": "account",
                "path": "market_account.owner",
                "account": "marketAccount"
              }
            ]
          }
        },
        {
          "name": "view",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  118,
                  105,
                  101,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "view.market_account",
                "account": "marketView"
              },
              {
                "kind": "account",
                "path": "view.nonce",
                "account": "marketView"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "viewMarketOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "viewQuoteCallback",
      "discriminator": [
        88,
        5,
        2,
        223,
        145,
        88,
        161,
        119
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "quote",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "quote.market",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.maker",
                "account": "quoteRecord"
              },
              {
                "kind": "account",
                "path": "quote.nonce",
                "account": "quoteRecord"
              }
            ]
          }
        },
        {
          "name": "view",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  45,
                  118,
                  105,
                  101,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "view.quote",
                "account": "quoteView"
              },
              {
                "kind": "account",
                "path": "view.owner",
                "account": "quoteView"
              },
              {
                "kind": "account",
                "path": "view.nonce",
                "account": "quoteView"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "viewQuoteOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "appConfig",
      "discriminator": [
        35,
        142,
        177,
        102,
        131,
        31,
        162,
        52
      ]
    },
    {
      "name": "arciumSignerAccount",
      "discriminator": [
        214,
        157,
        122,
        114,
        117,
        44,
        214,
        74
      ]
    },
    {
      "name": "backstopOffer",
      "discriminator": [
        80,
        181,
        176,
        205,
        9,
        233,
        175,
        92
      ]
    },
    {
      "name": "balanceAccount",
      "discriminator": [
        44,
        165,
        195,
        3,
        17,
        107,
        110,
        188
      ]
    },
    {
      "name": "balanceView",
      "discriminator": [
        244,
        122,
        182,
        103,
        189,
        165,
        123,
        88
      ]
    },
    {
      "name": "clearingAccount",
      "discriminator": [
        49,
        221,
        116,
        20,
        134,
        135,
        179,
        90
      ]
    },
    {
      "name": "depositReceipt",
      "discriminator": [
        64,
        175,
        24,
        183,
        138,
        109,
        70,
        78
      ]
    },
    {
      "name": "feeRecoveryRecord",
      "discriminator": [
        245,
        190,
        128,
        100,
        145,
        200,
        76,
        215
      ]
    },
    {
      "name": "fillView",
      "discriminator": [
        251,
        35,
        5,
        117,
        225,
        235,
        121,
        1
      ]
    },
    {
      "name": "marginTransfer",
      "discriminator": [
        117,
        46,
        183,
        155,
        192,
        101,
        0,
        69
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "marketAccount",
      "discriminator": [
        201,
        78,
        187,
        225,
        240,
        198,
        201,
        251
      ]
    },
    {
      "name": "marketView",
      "discriminator": [
        59,
        58,
        33,
        250,
        242,
        27,
        2,
        232
      ]
    },
    {
      "name": "operatorGrant",
      "discriminator": [
        217,
        203,
        120,
        253,
        64,
        111,
        156,
        25
      ]
    },
    {
      "name": "orderRecord",
      "discriminator": [
        143,
        44,
        79,
        139,
        27,
        191,
        114,
        204
      ]
    },
    {
      "name": "protocol",
      "discriminator": [
        45,
        39,
        101,
        43,
        115,
        72,
        131,
        40
      ]
    },
    {
      "name": "quoteQueue",
      "discriminator": [
        217,
        233,
        42,
        239,
        75,
        37,
        227,
        73
      ]
    },
    {
      "name": "quoteRecord",
      "discriminator": [
        35,
        26,
        2,
        134,
        242,
        21,
        161,
        78
      ]
    },
    {
      "name": "quoteView",
      "discriminator": [
        84,
        182,
        177,
        196,
        1,
        117,
        190,
        219
      ]
    },
    {
      "name": "recoveryConfig",
      "discriminator": [
        53,
        220,
        64,
        189,
        255,
        179,
        242,
        74
      ]
    },
    {
      "name": "winddown",
      "discriminator": [
        212,
        141,
        203,
        9,
        230,
        225,
        164,
        153
      ]
    },
    {
      "name": "winddownClaim",
      "discriminator": [
        72,
        63,
        184,
        202,
        251,
        216,
        52,
        64
      ]
    },
    {
      "name": "winddownFeeClaim",
      "discriminator": [
        88,
        97,
        79,
        122,
        208,
        221,
        194,
        144
      ]
    },
    {
      "name": "withdrawalReceipt",
      "discriminator": [
        167,
        235,
        84,
        7,
        210,
        55,
        67,
        114
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "abortedComputation",
      "msg": "The computation was aborted"
    },
    {
      "code": 6001,
      "name": "invalidMarketConfig",
      "msg": "The market configuration is invalid"
    },
    {
      "code": 6002,
      "name": "invalidSettlementMint",
      "msg": "The settlement mint must have six decimals"
    },
    {
      "code": 6003,
      "name": "unauthorized",
      "msg": "The actor is not authorized for this market operation"
    },
    {
      "code": 6004,
      "name": "invalidOperatorGrant",
      "msg": "The maker operator grant is invalid"
    },
    {
      "code": 6005,
      "name": "marketNotDraft",
      "msg": "The market is no longer a draft"
    },
    {
      "code": 6006,
      "name": "marketNotActive",
      "msg": "The market is not active"
    },
    {
      "code": 6007,
      "name": "marketNotPaused",
      "msg": "The market is not paused"
    },
    {
      "code": 6008,
      "name": "invalidOracleAccount",
      "msg": "The oracle account is invalid"
    },
    {
      "code": 6009,
      "name": "unverifiedOracle",
      "msg": "The oracle update is not fully verified"
    },
    {
      "code": 6010,
      "name": "wrongOracleFeed",
      "msg": "The oracle update is for a different feed"
    },
    {
      "code": 6011,
      "name": "staleOracle",
      "msg": "The oracle update is stale or from the future"
    },
    {
      "code": 6012,
      "name": "invalidOraclePrice",
      "msg": "The oracle price or exponent is invalid"
    },
    {
      "code": 6013,
      "name": "wideOracleConfidence",
      "msg": "The oracle confidence exceeds the market limit"
    },
    {
      "code": 6014,
      "name": "invalidQuote",
      "msg": "The quote envelope is invalid"
    },
    {
      "code": 6015,
      "name": "wrongQuoteStatus",
      "msg": "The quote is in the wrong state"
    },
    {
      "code": 6016,
      "name": "invalidBackstop",
      "msg": "The backstop offer is invalid"
    },
    {
      "code": 6017,
      "name": "wrongBackstopStatus",
      "msg": "The backstop offer is in the wrong state"
    },
    {
      "code": 6018,
      "name": "backstopAlreadyActive",
      "msg": "The market already has an active backstop offer"
    },
    {
      "code": 6019,
      "name": "quoteSnapshotFull",
      "msg": "The quote snapshot is full"
    },
    {
      "code": 6020,
      "name": "quoteHasOrders",
      "msg": "The quote has attached orders"
    },
    {
      "code": 6021,
      "name": "quoteCapacityExceeded",
      "msg": "The market quote capacity is exceeded"
    },
    {
      "code": 6022,
      "name": "invalidOrder",
      "msg": "The order envelope is invalid"
    },
    {
      "code": 6023,
      "name": "wrongOrderStatus",
      "msg": "The order is in the wrong state"
    },
    {
      "code": 6024,
      "name": "orderExpired",
      "msg": "The order deadline has passed"
    },
    {
      "code": 6025,
      "name": "orderNotExpired",
      "msg": "The order deadline has not passed"
    },
    {
      "code": 6026,
      "name": "wrongQuoteSnapshot",
      "msg": "The supplied quotes differ from the complete market snapshot"
    },
    {
      "code": 6027,
      "name": "unchangedConfig",
      "msg": "The market configuration is unchanged"
    },
    {
      "code": 6028,
      "name": "revisionOverflow",
      "msg": "The market revision overflowed"
    },
    {
      "code": 6029,
      "name": "invalidDeposit",
      "msg": "The deposit amount must be positive"
    },
    {
      "code": 6030,
      "name": "pendingOverflow",
      "msg": "The pending deposit total overflowed"
    },
    {
      "code": 6031,
      "name": "pendingUnderflow",
      "msg": "The pending deposit total underflowed"
    },
    {
      "code": 6032,
      "name": "alreadyRefunded",
      "msg": "The deposit has already been refunded"
    },
    {
      "code": 6033,
      "name": "depositAmountMismatch",
      "msg": "The vault received an unexpected amount"
    },
    {
      "code": 6034,
      "name": "invalidRecoveryKey",
      "msg": "The recovery key must be nonzero"
    },
    {
      "code": 6035,
      "name": "invalidRecoveryCommittee",
      "msg": "The recovery committee is invalid"
    },
    {
      "code": 6036,
      "name": "wrongPendingComputation",
      "msg": "The balance has a different pending computation"
    },
    {
      "code": 6037,
      "name": "wrongBalanceStatus",
      "msg": "The balance is in the wrong state"
    },
    {
      "code": 6038,
      "name": "wrongMarketAccountStatus",
      "msg": "The market account is in the wrong state"
    },
    {
      "code": 6039,
      "name": "wrongClearingStatus",
      "msg": "The clearing account is in the wrong state"
    },
    {
      "code": 6040,
      "name": "wrongPendingBalance",
      "msg": "The market account is bound to a different balance"
    },
    {
      "code": 6041,
      "name": "wrongMarket",
      "msg": "The market account is bound to a different market"
    },
    {
      "code": 6042,
      "name": "wrongMarginTransferStatus",
      "msg": "The margin transfer is in the wrong state"
    },
    {
      "code": 6043,
      "name": "wrongMarginTransfer",
      "msg": "The margin transfer is bound to a different account"
    },
    {
      "code": 6044,
      "name": "escrowOverflow",
      "msg": "The escrow total overflowed"
    },
    {
      "code": 6045,
      "name": "escrowUnderflow",
      "msg": "The escrow total underflowed"
    },
    {
      "code": 6046,
      "name": "wrongRecoveryKey",
      "msg": "The computation used a different recovery key"
    },
    {
      "code": 6047,
      "name": "wrongDepositStatus",
      "msg": "The deposit is in the wrong state"
    },
    {
      "code": 6048,
      "name": "wrongPendingReceipt",
      "msg": "The balance is bound to a different deposit"
    },
    {
      "code": 6049,
      "name": "creditedOverflow",
      "msg": "The credited balance total overflowed"
    },
    {
      "code": 6050,
      "name": "vaultUnderfunded",
      "msg": "The vault does not cover every pending and credited claim"
    },
    {
      "code": 6051,
      "name": "invalidWithdrawal",
      "msg": "The withdrawal amount must be positive"
    },
    {
      "code": 6052,
      "name": "insufficientCreditedTotal",
      "msg": "The total credited amount is too small"
    },
    {
      "code": 6053,
      "name": "wrongWithdrawalDestination",
      "msg": "The withdrawal destination differs from the approved destination"
    },
    {
      "code": 6054,
      "name": "invalidViewKey",
      "msg": "The view key must be nonzero"
    },
    {
      "code": 6055,
      "name": "wrongViewStatus",
      "msg": "The view request is in the wrong state"
    },
    {
      "code": 6056,
      "name": "wrongViewKey",
      "msg": "The computation used a different view key"
    },
    {
      "code": 6057,
      "name": "tradingActive",
      "msg": "Independent balance recovery is disabled during trading"
    },
    {
      "code": 6058,
      "name": "invalidRecoveryState",
      "msg": "The disclosed balance does not match the committed private state"
    },
    {
      "code": 6059,
      "name": "staleMarketSnapshot",
      "msg": "The signed market revision or oracle update has changed"
    },
    {
      "code": 6060,
      "name": "oracleSourceLocked",
      "msg": "The oracle account can change only while the market is draft or paused"
    }
  ],
  "types": [
    {
      "name": "activation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "activationEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          },
          {
            "name": "deactivationEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          }
        ]
      }
    },
    {
      "name": "appConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "app",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "version",
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "arciumSignerAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "bn254g2blsPublicKey",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "array": [
              "u8",
              64
            ]
          }
        ]
      }
    },
    {
      "name": "backstopOffer",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "capacity",
            "type": "u64"
          },
          {
            "name": "margin",
            "type": "u64"
          },
          {
            "name": "expiry",
            "type": "i64"
          },
          {
            "name": "marketRevision",
            "type": "u64"
          },
          {
            "name": "oracleTimestamp",
            "type": "i64"
          },
          {
            "name": "fundingIndex",
            "type": "i128"
          },
          {
            "name": "pendingComputation",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "backstopStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "backstopStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "reserving"
          },
          {
            "name": "active"
          },
          {
            "name": "locked"
          },
          {
            "name": "releasing"
          },
          {
            "name": "consumed"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "rejected"
          }
        ]
      }
    },
    {
      "name": "balanceAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "recoveryKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ciphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                2
              ]
            }
          },
          {
            "name": "nonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "recoveryCiphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                2
              ]
            }
          },
          {
            "name": "recoveryNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "version",
            "type": "u64"
          },
          {
            "name": "pendingComputation",
            "type": "pubkey"
          },
          {
            "name": "pendingReceipt",
            "type": "pubkey"
          },
          {
            "name": "pendingAmount",
            "type": "u64"
          },
          {
            "name": "pendingDestination",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "balanceStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "balanceStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "opening"
          },
          {
            "name": "ready"
          },
          {
            "name": "crediting"
          },
          {
            "name": "withdrawing"
          },
          {
            "name": "moving"
          },
          {
            "name": "claiming"
          }
        ]
      }
    },
    {
      "name": "balanceView",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "balance",
            "type": "pubkey"
          },
          {
            "name": "version",
            "type": "u64"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "viewKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pendingComputation",
            "type": "pubkey"
          },
          {
            "name": "ciphertext",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "outputNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "viewStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "circuitSource",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "local",
            "fields": [
              {
                "defined": {
                  "name": "localCircuitSource"
                }
              }
            ]
          },
          {
            "name": "onChain",
            "fields": [
              {
                "defined": {
                  "name": "onChainCircuitSource"
                }
              }
            ]
          },
          {
            "name": "offChain",
            "fields": [
              {
                "defined": {
                  "name": "offChainCircuitSource"
                }
              }
            ]
          }
        ]
      }
    },
    {
      "name": "claimTradeFeesOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "claimTradeFeesOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "claimTradeFeesOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field3",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "clearingAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "recoveryKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ciphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                2
              ]
            }
          },
          {
            "name": "nonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "recoveryCiphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                2
              ]
            }
          },
          {
            "name": "recoveryNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "version",
            "type": "u64"
          },
          {
            "name": "pendingComputation",
            "type": "pubkey"
          },
          {
            "name": "pendingReceipt",
            "type": "pubkey"
          },
          {
            "name": "pendingAmount",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "clearingStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "clearingStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "opening"
          },
          {
            "name": "ready"
          },
          {
            "name": "crediting"
          },
          {
            "name": "trading"
          },
          {
            "name": "claiming"
          }
        ]
      }
    },
    {
      "name": "clockAccount",
      "docs": [
        "An account storing the current network epoch"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "startEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          },
          {
            "name": "currentEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          },
          {
            "name": "startEpochTimestamp",
            "type": {
              "defined": {
                "name": "timestamp"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "cluster",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tdInfo",
            "type": {
              "option": {
                "defined": {
                  "name": "nodeMetadata"
                }
              }
            }
          },
          {
            "name": "authority",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "clusterSize",
            "type": "u16"
          },
          {
            "name": "activation",
            "type": {
              "defined": {
                "name": "activation"
              }
            }
          },
          {
            "name": "maxCapacity",
            "type": "u64"
          },
          {
            "name": "cuPrice",
            "type": "u64"
          },
          {
            "name": "cuPriceProposals",
            "type": {
              "array": [
                "u64",
                32
              ]
            }
          },
          {
            "name": "lastUpdatedEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          },
          {
            "name": "nodes",
            "type": {
              "vec": {
                "defined": {
                  "name": "nodeRef"
                }
              }
            }
          },
          {
            "name": "pendingNodes",
            "type": {
              "vec": "u32"
            }
          },
          {
            "name": "blsPublicKey",
            "type": {
              "defined": {
                "name": "setUnset",
                "generics": [
                  {
                    "kind": "type",
                    "type": {
                      "defined": {
                        "name": "bn254g2blsPublicKey"
                      }
                    }
                  }
                ]
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "currentEpochTotalRewards",
            "type": "u64"
          },
          {
            "name": "rewardsEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          },
          {
            "name": "leaderSelector",
            "type": {
              "defined": {
                "name": "leaderSelector"
              }
            }
          }
        ]
      }
    },
    {
      "name": "computationDefinitionAccount",
      "docs": [
        "An account representing a [ComputationDefinition] in a MXE."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "deactivationSlot",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "cuAmount",
            "type": "u64"
          },
          {
            "name": "definition",
            "type": {
              "defined": {
                "name": "computationDefinitionMeta"
              }
            }
          },
          {
            "name": "circuitSource",
            "type": {
              "defined": {
                "name": "circuitSource"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                24
              ]
            }
          }
        ]
      }
    },
    {
      "name": "computationDefinitionMeta",
      "docs": [
        "A computation definition for execution in a MXE."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circuitLen",
            "type": "u32"
          },
          {
            "name": "signature",
            "type": {
              "defined": {
                "name": "computationSignature"
              }
            }
          }
        ]
      }
    },
    {
      "name": "computationSignature",
      "docs": [
        "The signature of a computation defined in a [ComputationDefinition]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "parameters",
            "type": {
              "vec": {
                "defined": {
                  "name": "parameter"
                }
              }
            }
          },
          {
            "name": "outputs",
            "type": {
              "vec": {
                "defined": {
                  "name": "output"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "creditBalanceOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "creditBalanceOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "creditBalanceOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field3",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "creditFreeOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "creditFreeOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "creditFreeOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field3",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "creditInsuranceOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "creditInsuranceOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "creditInsuranceOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field3",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "creditMarketOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "creditMarketOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "creditMarketOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field3",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "debitBalanceOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "debitBalanceOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "debitBalanceOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field3",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "debitFreeOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "debitFreeOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "debitFreeOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field3",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "debitMarketV2Output",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "debitMarketV2OutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "debitMarketV2OutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field3",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "depositReceipt",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "depositStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "depositStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "crediting"
          },
          {
            "name": "credited"
          },
          {
            "name": "refunded"
          }
        ]
      }
    },
    {
      "name": "epoch",
      "docs": [
        "The network epoch"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          "u64"
        ]
      }
    },
    {
      "name": "feeClaimStage",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "idle"
          },
          {
            "name": "computing"
          },
          {
            "name": "ready"
          },
          {
            "name": "sealing"
          }
        ]
      }
    },
    {
      "name": "feePool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "feeRecoveryRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "order",
            "type": "pubkey"
          },
          {
            "name": "recoveryKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ciphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                3
              ]
            }
          },
          {
            "name": "nonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "fillView",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "order",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "viewKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pendingComputation",
            "type": "pubkey"
          },
          {
            "name": "ciphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                3
              ]
            }
          },
          {
            "name": "outputNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "viewStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "leaderChoice",
      "docs": [
        "The computation chosen by a node to be executed when the node is leader."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offset",
            "type": "u64"
          },
          {
            "name": "slotIdx",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "leaderInfo",
      "docs": [
        "The information about a node."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "count",
            "type": "u64"
          },
          {
            "name": "lastCounterPlusOne",
            "type": "u64"
          },
          {
            "name": "choice",
            "type": {
              "defined": {
                "name": "leaderChoice"
              }
            }
          }
        ]
      }
    },
    {
      "name": "leaderSelector",
      "docs": [
        "To select a Leader.",
        "Uses the greatest divisors method: https://en.wikipedia.org/wiki/D%27Hondt_method"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stakingEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          },
          {
            "name": "info",
            "type": {
              "vec": {
                "defined": {
                  "name": "leaderInfo"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "liquidateV2Output",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "liquidateV2OutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "liquidateV2OutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field3",
            "type": "bool"
          },
          {
            "name": "field4",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "localCircuitSource",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "mxeKeygen"
          },
          {
            "name": "mxeKeyRecoveryInit"
          },
          {
            "name": "mxeKeyRecoveryFinalize"
          }
        ]
      }
    },
    {
      "name": "mxeAccount",
      "docs": [
        "A MPC Execution Environment."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "padding",
            "type": "u8"
          },
          {
            "name": "cluster",
            "type": "u32"
          },
          {
            "name": "keygenOffset",
            "type": "u64"
          },
          {
            "name": "keyRecoveryInitOffset",
            "type": "u64"
          },
          {
            "name": "mxeProgramId",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "utilityPubkeys",
            "type": {
              "defined": {
                "name": "setUnset",
                "generics": [
                  {
                    "kind": "type",
                    "type": {
                      "defined": {
                        "name": "utilityPubkeys"
                      }
                    }
                  }
                ]
              }
            }
          },
          {
            "name": "lutOffsetSlot",
            "type": "u64"
          },
          {
            "name": "computationDefinitions",
            "type": {
              "vec": "u32"
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "mxeStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "currentEpochRecoveryRewards",
            "type": "u64"
          },
          {
            "name": "recoveryRewardsEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          }
        ]
      }
    },
    {
      "name": "mxeEncryptedStruct",
      "generics": [
        {
          "kind": "const",
          "name": "len",
          "type": "usize"
        }
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nonce",
            "type": "u128"
          },
          {
            "name": "ciphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                {
                  "generic": "len"
                }
              ]
            }
          }
        ]
      }
    },
    {
      "name": "marginTransfer",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "toMarket",
            "type": "bool"
          },
          {
            "name": "pendingComputation",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marginTransferStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "marketRevision",
            "type": "u64"
          },
          {
            "name": "oracleTimestamp",
            "type": "i64"
          },
          {
            "name": "oraclePriceE8",
            "type": "u64"
          },
          {
            "name": "fundingIndex",
            "type": "i128"
          },
          {
            "name": "accountVersion",
            "type": "u64"
          },
          {
            "name": "deadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marginTransferStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "debiting"
          },
          {
            "name": "escrow"
          },
          {
            "name": "crediting"
          },
          {
            "name": "settled"
          },
          {
            "name": "refunded"
          },
          {
            "name": "rejected"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "settlementMint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "oracleAccount",
            "type": "pubkey"
          },
          {
            "name": "config",
            "type": {
              "defined": {
                "name": "marketConfig"
              }
            }
          },
          {
            "name": "revision",
            "type": "u64"
          },
          {
            "name": "fundingIndex",
            "type": "i128"
          },
          {
            "name": "lastFundingTimestamp",
            "type": "i64"
          },
          {
            "name": "oraclePriceE8",
            "type": "u64"
          },
          {
            "name": "oracleEmaE8",
            "type": "u64"
          },
          {
            "name": "oracleConfidenceE8",
            "type": "u64"
          },
          {
            "name": "oracleTimestamp",
            "type": "i64"
          },
          {
            "name": "oracleSlot",
            "type": "u64"
          },
          {
            "name": "activeQuotes",
            "type": {
              "array": [
                "pubkey",
                4
              ]
            }
          },
          {
            "name": "activeQuoteCount",
            "type": "u8"
          },
          {
            "name": "quotedNotional",
            "type": "u64"
          },
          {
            "name": "backstopOffer",
            "type": "pubkey"
          },
          {
            "name": "pendingOrders",
            "type": "u16"
          },
          {
            "name": "pendingOrder",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "incident",
            "type": {
              "defined": {
                "name": "marketIncident"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "recoveryKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ciphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                3
              ]
            }
          },
          {
            "name": "nonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "recoveryCiphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                3
              ]
            }
          },
          {
            "name": "recoveryNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "version",
            "type": "u64"
          },
          {
            "name": "lastLiquidationTimestamp",
            "type": "i64"
          },
          {
            "name": "pendingComputation",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marketAccountStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketAccountStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "opening"
          },
          {
            "name": "ready"
          },
          {
            "name": "moving"
          },
          {
            "name": "reserving"
          },
          {
            "name": "releasing"
          },
          {
            "name": "matching"
          },
          {
            "name": "trading"
          }
        ]
      }
    },
    {
      "name": "marketConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "initialMarginBps",
            "type": "u16"
          },
          {
            "name": "maintenanceMarginBps",
            "type": "u16"
          },
          {
            "name": "liquidationFeeBps",
            "type": "u16"
          },
          {
            "name": "tradeFeeBps",
            "type": "u16"
          },
          {
            "name": "insuranceFeeBps",
            "type": "u16"
          },
          {
            "name": "maxAccountNotional",
            "type": "u64"
          },
          {
            "name": "maxMarketNotional",
            "type": "u64"
          },
          {
            "name": "maxOracleAgeSeconds",
            "type": "u32"
          },
          {
            "name": "maxConfidenceBps",
            "type": "u16"
          },
          {
            "name": "maxQuoteDeviationBps",
            "type": "u16"
          },
          {
            "name": "maxQuoteLifetimeSeconds",
            "type": "u32"
          },
          {
            "name": "maxOrderQueueSeconds",
            "type": "u32"
          },
          {
            "name": "fundingIntervalSeconds",
            "type": "u32"
          },
          {
            "name": "fundingRateCapBps",
            "type": "u16"
          },
          {
            "name": "quoteTiers",
            "type": {
              "array": [
                "u64",
                4
              ]
            }
          },
          {
            "name": "backstopMinCollateral",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "marketIncident",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "manualPause"
          },
          {
            "name": "staleOracle"
          },
          {
            "name": "missedFunding"
          },
          {
            "name": "clusterUnavailable"
          },
          {
            "name": "collateralDeficit"
          },
          {
            "name": "callbackFailure"
          },
          {
            "name": "backstopUnavailable"
          }
        ]
      }
    },
    {
      "name": "marketStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "draft"
          },
          {
            "name": "active"
          },
          {
            "name": "paused"
          },
          {
            "name": "settling"
          }
        ]
      }
    },
    {
      "name": "marketView",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "marketAccount",
            "type": "pubkey"
          },
          {
            "name": "version",
            "type": "u64"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "viewKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pendingComputation",
            "type": "pubkey"
          },
          {
            "name": "ciphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                3
              ]
            }
          },
          {
            "name": "outputNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "viewStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "matchOrderOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "matchOrderOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "matchOrderOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field3",
            "type": "u8"
          },
          {
            "name": "field4",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "mxeStatus",
      "docs": [
        "The status of an MXE."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "migration"
          }
        ]
      }
    },
    {
      "name": "nodeMetadata",
      "docs": [
        "location as [ISO 3166-1 alpha-2](https://www.iso.org/iso-3166-country-codes.html) country code"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ip",
            "type": {
              "array": [
                "u8",
                4
              ]
            }
          },
          {
            "name": "peerId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "location",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "nodeRef",
      "docs": [
        "A reference to a node in the cluster.",
        "The offset is to derive the Node Account."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offset",
            "type": "u32"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                8
              ]
            }
          },
          {
            "name": "vote",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "offChainCircuitSource",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "source",
            "type": "string"
          },
          {
            "name": "hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "offerBackstopV2Output",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "offerBackstopV2OutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "offerBackstopV2OutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field3",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "onChainCircuitSource",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "isCompleted",
            "type": "bool"
          },
          {
            "name": "uploadAuth",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "openBalanceOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "openBalanceOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "openBalanceOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "openClearingOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "openClearingOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "openClearingOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "openMarketOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "openMarketOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "openMarketOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "operatorGrant",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "maxCapacity",
            "type": "u64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "canView",
            "type": "bool"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "version",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "orderKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "trade"
          },
          {
            "name": "liquidation"
          }
        ]
      }
    },
    {
      "name": "orderRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "app",
            "type": "pubkey"
          },
          {
            "name": "appFeeBps",
            "type": "u16"
          },
          {
            "name": "appFeeVersion",
            "type": "u64"
          },
          {
            "name": "reduceOnly",
            "type": "bool"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "quoteKeys",
            "type": {
              "array": [
                "pubkey",
                4
              ]
            }
          },
          {
            "name": "quoteCount",
            "type": "u8"
          },
          {
            "name": "marketRevision",
            "type": "u64"
          },
          {
            "name": "oracleTimestamp",
            "type": "i64"
          },
          {
            "name": "oraclePriceE8",
            "type": "u64"
          },
          {
            "name": "traderVersion",
            "type": "u64"
          },
          {
            "name": "makerVersion",
            "type": "u64"
          },
          {
            "name": "clearingVersion",
            "type": "u64"
          },
          {
            "name": "fundingIndex",
            "type": "i128"
          },
          {
            "name": "planCiphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                3
              ]
            }
          },
          {
            "name": "planNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "candidatePrimary",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                3
              ]
            }
          },
          {
            "name": "candidatePrimaryNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "candidateSecondary",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                3
              ]
            }
          },
          {
            "name": "candidateSecondaryNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "candidateClearing",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                2
              ]
            }
          },
          {
            "name": "candidateClearingNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "sealedTrader",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                3
              ]
            }
          },
          {
            "name": "sealedTraderNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "traderRecovery",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                3
              ]
            }
          },
          {
            "name": "traderRecoveryNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "traderCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "sealedMaker",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                3
              ]
            }
          },
          {
            "name": "sealedMakerNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "makerRecovery",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                3
              ]
            }
          },
          {
            "name": "makerRecoveryNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "makerCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "selectedQuote",
            "type": "pubkey"
          },
          {
            "name": "pendingComputation",
            "type": "pubkey"
          },
          {
            "name": "feesClaimed",
            "type": "bool"
          },
          {
            "name": "claimDeadline",
            "type": "i64"
          },
          {
            "name": "claimStage",
            "type": {
              "defined": {
                "name": "feeClaimStage"
              }
            }
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "orderKind"
              }
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "orderStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "orderStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "matching"
          },
          {
            "name": "matched"
          },
          {
            "name": "settling"
          },
          {
            "name": "riskApproved"
          },
          {
            "name": "sealingTrader"
          },
          {
            "name": "traderSealed"
          },
          {
            "name": "sealingMaker"
          },
          {
            "name": "makerSealed"
          },
          {
            "name": "sealingClearing"
          },
          {
            "name": "filled"
          },
          {
            "name": "rejected"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "output",
      "docs": [
        "An output of a computation.",
        "We currently don't support encrypted outputs yet since encrypted values are passed via",
        "data objects."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "plaintextBool"
          },
          {
            "name": "plaintextU8"
          },
          {
            "name": "plaintextU16"
          },
          {
            "name": "plaintextU32"
          },
          {
            "name": "plaintextU64"
          },
          {
            "name": "plaintextU128"
          },
          {
            "name": "ciphertext"
          },
          {
            "name": "arcisX25519Pubkey"
          },
          {
            "name": "plaintextFloat"
          },
          {
            "name": "plaintextPoint"
          },
          {
            "name": "plaintextI8"
          },
          {
            "name": "plaintextI16"
          },
          {
            "name": "plaintextI32"
          },
          {
            "name": "plaintextI64"
          },
          {
            "name": "plaintextI128"
          }
        ]
      }
    },
    {
      "name": "parameter",
      "docs": [
        "A parameter of a computation.",
        "We differentiate between plaintext and encrypted parameters and data objects.",
        "Plaintext parameters are directly provided as their value.",
        "Encrypted parameters are provided as an offchain reference to the data.",
        "Data objects are provided as a reference to the data object account."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "plaintextBool"
          },
          {
            "name": "plaintextU8"
          },
          {
            "name": "plaintextU16"
          },
          {
            "name": "plaintextU32"
          },
          {
            "name": "plaintextU64"
          },
          {
            "name": "plaintextU128"
          },
          {
            "name": "ciphertext"
          },
          {
            "name": "arcisX25519Pubkey"
          },
          {
            "name": "arcisSignature"
          },
          {
            "name": "plaintextFloat"
          },
          {
            "name": "plaintextI8"
          },
          {
            "name": "plaintextI16"
          },
          {
            "name": "plaintextI32"
          },
          {
            "name": "plaintextI64"
          },
          {
            "name": "plaintextI128"
          },
          {
            "name": "plaintextPoint"
          }
        ]
      }
    },
    {
      "name": "prepareQuoteOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "prepareQuoteOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "prepareQuoteOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "6"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "protocol",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "settlementMint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "pendingTotal",
            "type": "u64"
          },
          {
            "name": "creditedTotal",
            "type": "u64"
          },
          {
            "name": "escrowTotal",
            "type": "u64"
          },
          {
            "name": "tradingEnabled",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "quoteQueue",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "entries",
            "type": {
              "array": [
                "pubkey",
                8
              ]
            }
          },
          {
            "name": "count",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "quoteRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "operatorVersion",
            "type": "u64"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "capacity",
            "type": "u64"
          },
          {
            "name": "requiredMargin",
            "type": "u64"
          },
          {
            "name": "expiry",
            "type": "i64"
          },
          {
            "name": "tierCount",
            "type": "u8"
          },
          {
            "name": "marketRevision",
            "type": "u64"
          },
          {
            "name": "oracleTimestamp",
            "type": "i64"
          },
          {
            "name": "fundingIndex",
            "type": "i128"
          },
          {
            "name": "ciphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                6
              ]
            }
          },
          {
            "name": "cipherNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "balanceCiphertext",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "balanceNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "pendingBalanceCiphertext",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pendingBalanceNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "pendingComputation",
            "type": "pubkey"
          },
          {
            "name": "attachedOrders",
            "type": "u16"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "quoteStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "replacementNonce",
            "type": {
              "option": "u64"
            }
          }
        ]
      }
    },
    {
      "name": "quoteStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "validating"
          },
          {
            "name": "validated"
          },
          {
            "name": "waiting"
          },
          {
            "name": "reserving"
          },
          {
            "name": "active"
          },
          {
            "name": "closing"
          },
          {
            "name": "releasing"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "filled"
          },
          {
            "name": "rejected"
          }
        ]
      }
    },
    {
      "name": "quoteView",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "quote",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "sourceNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "viewKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pendingComputation",
            "type": "pubkey"
          },
          {
            "name": "ciphertext",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "outputNonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "viewStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "recoveryConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "recoveryKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "signers",
            "type": {
              "array": [
                "pubkey",
                5
              ]
            }
          },
          {
            "name": "accountCount",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "releaseBackstopOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "releaseBackstopOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "releaseBackstopOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field3",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "releaseQuoteOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "releaseQuoteOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "releaseQuoteOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field3",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "reserveQuoteV2Output",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "reserveQuoteV2OutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "reserveQuoteV2OutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field3",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "sealClearingOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sealClearingOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "sealClearingOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "sealMarketOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sealMarketOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "sealMarketOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "sealTradeFeesOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sealTradeFeesOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "sealTradeFeesOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field2",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field3",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "field4",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field5",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "setUnset",
      "docs": [
        "Utility struct to store a value that needs to be set by a certain number of participants (keys",
        "in our case). Once all participants have set the value, the value is considered set and we only",
        "store it once."
      ],
      "generics": [
        {
          "kind": "type",
          "name": "t"
        }
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "set",
            "fields": [
              {
                "generic": "t"
              }
            ]
          },
          {
            "name": "unset",
            "fields": [
              {
                "generic": "t"
              },
              {
                "vec": "bool"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "settleTradeV2Output",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "settleTradeV2OutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "settleTradeV2OutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field3",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          },
          {
            "name": "field4",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "sharedEncryptedStruct",
      "generics": [
        {
          "kind": "const",
          "name": "len",
          "type": "usize"
        }
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "encryptionKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "nonce",
            "type": "u128"
          },
          {
            "name": "ciphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                {
                  "generic": "len"
                }
              ]
            }
          }
        ]
      }
    },
    {
      "name": "signedComputationOutputs",
      "generics": [
        {
          "kind": "type",
          "name": "o"
        }
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "success",
            "fields": [
              {
                "generic": "o"
              },
              {
                "array": [
                  "u8",
                  64
                ]
              }
            ]
          },
          {
            "name": "failure"
          },
          {
            "name": "markerForIdlBuildDoNotUseThis",
            "fields": [
              {
                "generic": "o"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "timestamp",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "timestamp",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "utilityPubkeys",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "x25519Pubkey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ed25519VerifyingKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "elgamalPubkey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pubkeyValidityProof",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "viewBalanceOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          }
        ]
      }
    },
    {
      "name": "viewFillOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          }
        ]
      }
    },
    {
      "name": "viewMarketOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "3"
                  }
                ]
              }
            }
          }
        ]
      }
    },
    {
      "name": "viewQuoteOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          }
        ]
      }
    },
    {
      "name": "viewStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "ready"
          },
          {
            "name": "stale"
          }
        ]
      }
    },
    {
      "name": "winddown",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "priceE8",
            "type": "u64"
          },
          {
            "name": "fundingIndex",
            "type": "i128"
          },
          {
            "name": "expectedAccounts",
            "type": "u32"
          },
          {
            "name": "revealedAccounts",
            "type": "u32"
          },
          {
            "name": "paidAccounts",
            "type": "u32"
          },
          {
            "name": "openInterest",
            "type": "u64"
          },
          {
            "name": "insurance",
            "type": "u64"
          },
          {
            "name": "protocolFees",
            "type": "u64"
          },
          {
            "name": "appFees",
            "type": "u64"
          },
          {
            "name": "revealedProtocolFees",
            "type": "u64"
          },
          {
            "name": "revealedAppFees",
            "type": "u64"
          },
          {
            "name": "appClaims",
            "type": "u32"
          },
          {
            "name": "paidAppClaims",
            "type": "u32"
          },
          {
            "name": "protocolFeesPaid",
            "type": "bool"
          },
          {
            "name": "totalCollateral",
            "type": "u128"
          },
          {
            "name": "grossPositive",
            "type": "u128"
          },
          {
            "name": "netPosition",
            "type": "i128"
          },
          {
            "name": "absolutePosition",
            "type": "u128"
          },
          {
            "name": "payoutPool",
            "type": "u64"
          },
          {
            "name": "remainingPool",
            "type": "u64"
          },
          {
            "name": "finalized",
            "type": "bool"
          },
          {
            "name": "swept",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "winddownClaim",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "winddown",
            "type": "pubkey"
          },
          {
            "name": "marketAccount",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "positiveEquity",
            "type": "u128"
          },
          {
            "name": "paid",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "winddownFeeClaim",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "winddown",
            "type": "pubkey"
          },
          {
            "name": "order",
            "type": "pubkey"
          },
          {
            "name": "app",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "paid",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "withdrawalReceipt",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "balance",
            "type": "pubkey"
          },
          {
            "name": "destination",
            "type": "pubkey"
          },
          {
            "name": "computation",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "version",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "withdrawalStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "withdrawalStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "queued"
          },
          {
            "name": "paid"
          },
          {
            "name": "rejected"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "seed",
      "type": "string",
      "value": "\"arcium\""
    }
  ]
};
