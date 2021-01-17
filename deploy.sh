#!/bin/sh

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 function-name"
  exit 1
fi

FUNCTION_NAME=$1

aws lambda update-function-code --function-name $FUNCTION_NAME --zip-file fileb://deployment/deployment.zip