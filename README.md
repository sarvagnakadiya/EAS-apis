The latest code is in ./index2.js

# registerSchema

```curl
curl --location 'http://localhost:3003/registerSchema' \
--header 'Content-Type: application/json' \
--data '{
    "schemaRegistryContractAddress": "0x4200000000000000000000000000000000000020",
    "resolverAddress": "0xb18467D512b547785c8e60AcDa8715b3bFA41d97"
}'
```

# attestOnchain

```curl
curl --location 'http://localhost:3003/attestOnchain' \
--header 'Content-Type: application/json' \
--data '{
    "recipient": "0xbFc4A28D8F1003Bec33f4Fdb7024ad6ad1605AA8",
    "meetingId": "abc-def-ghi",
    "meetingType": 1,
    "startTime": 1718872513,
    "endTime": 1718876113
}'
```
