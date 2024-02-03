import {
    Submission,
    JobData,
    JobFiles,
    JobResult, Assignment, TestCaseStatus, RunnerImage, ParentJobData,
} from "codetierlist-types";
import {getCommit, getFile} from "./utils";
import {
    Queue,
    QueueEvents,
    Job,
    FlowProducer,
    Worker
} from "bullmq";
import {runTestcase, updateScore} from "./updateScores";
import prisma from "./prisma";
import {QueueOptions} from "bullmq/dist/esm/interfaces";
import {publish} from "./achievements/eventHandler";
import {TestCase} from "@prisma/client";


export enum JobType {
    validateTestCase = "validateTestCase",
    testSubmission = "testSubmission",
    profSubmission = "profSubmission",
    parentJob = "parentJob"
}

if (process.env.REDIS_HOST === undefined) {
    throw new Error("REDIS_HOST is undefined");
}

if (process.env.REDIS_PORT === undefined) {
    throw new Error("REDIS_PORT is undefined");
}

if (process.env.REDIS_PASSWORD === undefined) {
    console.warn("REDIS_PASSWORD is undefined, connection might fail");
}
let max_fetched = parseInt(process.env.MAX_FETCHED_JOBS ?? '5000');
if (isNaN(max_fetched)) {
    console.warn("MAX_FETCHED_JOBS is not a number, defaulting to 5000");
    max_fetched = 5000;
}

const queue_conf: QueueOptions = {
    connection: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD
    }
};
const job_queue: Queue<JobData, JobResult, JobType> =
    new Queue<JobData, JobResult, JobType>("job_queue", queue_conf);
const pending_queue: Queue<Omit<JobData, "query">, undefined, JobType> =
    new Queue<JobData, undefined, JobType>("pending_queue", queue_conf);

const job_events: QueueEvents = new QueueEvents("job_queue", queue_conf);

const parent_job_queue = "parent_job";

const flowProducer = new FlowProducer(queue_conf);

// TODO: move file fetching to runner
export const getFiles = async (submission: Submission | TestCase): Promise<JobFiles> => {
    const res: JobFiles = {};
    const commit = await getCommit(submission);
    if (!commit) {
        throw new Error("Commit not found in runner");
    }

    await Promise.all(commit.files.map(async (x) => {
        const file = await getFile(x, submission.git_url, submission.git_id);
        if (!file) return;
        res[x] = Buffer.from(file.blob.buffer).toString("base64");
    }));
    return res;
};


export const bulkQueueTestCases = async <T extends Submission | TestCase>(image: RunnerImage, item: T, queue: (T extends TestCase ? Submission : TestCase)[]) => {
    console.info(`Bulk queueing ${queue.length} test cases for ${item.author_id} submission/test case`);
    await flowProducer.add({
        name: JobType.parentJob,
        queueName: parent_job_queue,
        opts: {
            removeOnFail: true,
            removeOnComplete: true,
        },
        data: {
            item: item,
            type: "valid" in item ? "testcase" : "submission"
        } satisfies ParentJobData,
        children: queue.map(cur => {
            const submission = "valid" in item ? cur as Submission : item as Submission;
            const testCase = "valid" in item ? item as TestCase : cur as TestCase;
            return {
                data: {
                    submission,
                    testCase,
                    image
                },
                name: JobType.testSubmission,
                queueName: pending_queue.name
            };
        })
    });
    // await Promise.all(queue.map(async cur =>{
    //     const submission = "valid" in item ? cur as Submission : item as Submission;
    //     const testCase = "valid" in item ? item as TestCase : cur as TestCase ;
    //     // eslint-disable-next-line @typescript-eslint/no-use-before-define
    //     return queueJob({submission, testCase, image}, JobType.testSubmission);
    // }));
};

// TODO: add empty submission and testcase reporting
// TODO: probably use name to determine what to do with result
/**
 * Pushes a job to the queue
 * Returns the job id as a string, or undefined if failed
 */
export const queueJob = async (job: {
    submission: Submission,
    testCase: TestCase,
    image: Assignment | RunnerImage,
}, name: JobType, priority: number = 10): Promise<string | undefined> => {
    // push to redis queue
    const redis_job = await pending_queue.add(name, {
        testCase: job.testCase,
        submission: job.submission,
        image: job.image,
    }, {priority});
    console.info(`job ${redis_job.id} added to queue`);
    return redis_job.id;
};

job_events.on("completed", async ({jobId}) => {
    const job = await Job.fromId<JobData, JobResult, JobType>(job_queue, jobId);
    if (!job) return;
    const data = job.data;
    const result = job.returnvalue;
    if (!data || !result) {
        console.error(`job ${job.id} completed with no data or result`);
        return;
    }
    console.info(`job ${job.id} completed with status ${result.status} with data ${JSON.stringify(result)}`);
    const submission = data.submission;
    const testCase = data.testCase;
    const pass = result.status === "PASS";
    if (!job.parentKey) {
        await job.remove();
    }
    if ([JobType.validateTestCase, JobType.profSubmission].includes(job.name)) {
        let status: TestCaseStatus = "VALID";
        if (["ERROR", "FAIL"].includes(result.status)) {
            status = "INVALID";
        } else if (result.status === "TESTCASE_EMPTY") {
            status = "EMPTY";
        }
        await prisma.testCase.update({
            where: {
                id: testCase.id
            }, data: {valid: status}
        });
        // if the test case is valid, run the test case on all student submissions
        if ((job.name === JobType.validateTestCase || job.data.testCase.valid !== "VALID") && status === "VALID") {
            await runTestcase(testCase, data.image);
        }
        return;
    }
    // not a validation job, update the score in db
    await updateScore(submission, testCase, pass);
});

export const removeSubmission = async (utorid: string): Promise<void> => {
    await Promise.all(await job_queue.getJobs(["waiting", "active"])
        .then(async (jobs) =>
            jobs.filter(job => job.data?.submission?.author_id === utorid)
                .map(async job => await job.remove())));
};

export const removeTestcases = async (utorid: string): Promise<void> => {
    await Promise.all(await job_queue.getJobs(["waiting", "active"])
        .then(async (jobs) =>
            jobs.filter(job => job.data?.testCase?.author_id === utorid)
                .map(async job => await job.remove())));
};

new Worker<ParentJobData, undefined, JobType>(parent_job_queue, async (job) => {
    if (!job || !job.data) return;
    const children = Object.values(await job.getChildrenValues<JobResult>());
    const item = job.data.item;
    const type = job.data.type;
    const passed = children.filter(x => x.status === "PASS");
    if (type === "submission") {
        const submission = item as Submission;
        publish("solution:processed", submission, {
            passed: passed.length,
            total: children.length
        });
    }
    if (type === "testcase") {
        const testCase = item as TestCase;
        const passedOrFailed = children.filter(x => x.status === "PASS" || x.status === "FAIL");
        publish("testcase:processed", testCase, {
            passed: passed.length,
            total: children.length,
            number: passedOrFailed.map(x => "amount" in x ? x.amount : 0).reduce((a, b) => a + b, 0) / passedOrFailed.length
        });
    }
    console.info(`Parent job ${job.id} completed with ${passed.length} passed out of ${children.length}. Finished processing at ${Date.now()}`);
    return undefined;
}, queue_conf);

const fetchWorker = new Worker<Omit<JobData, "query">, undefined, JobType>(pending_queue.name, async (job) => {
    const isRateLimited = await pending_queue.count();
    if (isRateLimited >= max_fetched) {
        await fetchWorker.rateLimit(1000);
        throw Worker.RateLimitError();
    }
    if (!job || !job.data || !job.name) return;
    const data = job.data;
    const query = {
        'solution_files': await getFiles(data.submission),
        'test_case_files': await getFiles(data.testCase),
    };
    await job_queue.add(job.name, {...data, query});
    await job.remove();
}, {
    ...queue_conf,
    limiter: {
        max: 100,
        duration: 500,
    },
},);
