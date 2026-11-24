# Local preview of the wiki: Python (MkDocs) + Node (the tools/build-*.js generators).
# The repo itself is mounted at /wiki by docker-compose.yml, so only the dependencies are baked in.
FROM python:3.12-slim
COPY --from=node:20-slim /usr/local/bin/node /usr/local/bin/node
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
WORKDIR /wiki
EXPOSE 8000
CMD ["node", "tools/watch.js"]
