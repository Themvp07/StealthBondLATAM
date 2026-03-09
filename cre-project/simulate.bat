@echo off
cd /d C:\CRE_Hackthon\codigo\cre-project
cre workflow simulate workflows\stage1-company -T simulation --non-interactive --trigger-index 0 --http-payload "@payload.json"
