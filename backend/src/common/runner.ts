import {
    Submission,
    TestCase,
    JobData,
    JobFiles,
    JobResult, Assignment, JobStatus, TestCaseStatus,
} from "codetierlist-types";
import {getCommit, getFile} from "./utils";
import {Queue, QueueEvents, Job} from "bullmq";
import {runTestcase, updateScore} from "./updateScores";
import prisma from "./prisma";

export enum JobType {
    validateTestCase = "validateTestCase",
    testSubmission = "testSubmission",
    profSubmission = "profSubmission"
}
if (process.env.REDIS_HOST === undefined) {
    throw new Error("REDIS_HOST is undefined");
}

if (process.env.REDIS_PORT === undefined) {
    throw new Error("REDIS_PORT is undefined");
}

const queue_conf = {connection: {host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT)}};
const job_queue: Queue<JobData, JobResult, JobType> =
    new Queue<JobData, JobResult, JobType>("job_queue", queue_conf);

const job_events: QueueEvents = new QueueEvents("job_queue", queue_conf);

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
        const decoder = new TextDecoder('utf8');
        res[x] = btoa(decoder.decode(file.blob));
    }));
    return res;
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
    assignment: Assignment | { runner_image: string, image_version: string }
}, name: JobType): Promise<string | undefined> => {
    // TODO get the files in runner
    // let query: { solution_files: JobFiles, test_case_files: JobFiles };
    // try {
    //     query = {
    //         'solution_files': await getFiles(job.submission),
    //         'test_case_files': await getFiles(job.testCase),
    //     };
    // } catch (e) {
    //     console.error(e);
    //     return undefined;
    // }
    //
    // if (Object.keys(query.test_case_files).length == 0) {
    //     return undefined;
    // }
    //
    // if (Object.keys(query.solution_files).length == 0) {
    //     return undefined;
    // }

    const img = job.assignment.runner_image;
    const img_ver = job.assignment.image_version;

    const jd: JobData = {
        img,
        img_ver,
        testCase: job.testCase,
        submission: job.submission,
    };

    // push to redis queue
    const redis_job = await job_queue.add(name, jd);
    return redis_job.id;
};

job_events.on("completed", async ({jobId}) => {
    const job = await Job.fromId<JobData, JobResult, JobType>(job_queue, jobId);
    if (!job) return;
    const data = job.data as JobData;
    const result = job.returnvalue;
    const submission = data.submission;
    const testCase = data.testCase;
    const pass = result.status === "PASS";
    if([JobType.validateTestCase, JobType.profSubmission].includes(job.name)) {
        let status:TestCaseStatus = "VALID";
        if([JobStatus.ERROR, JobStatus.FAIL].includes(result.status)){
            status="INVALID";
        } else if (result.status == JobStatus.TESTCASE_EMPTY){
            status="EMPTY";
        }
        await prisma.testCase.update({
            where: {
                id: testCase.id
            }, data: {valid: status}
        });
        // if the test case is valid, run the test case on all student submissions
        if((job.name=== JobType.validateTestCase || job.data.testCase.valid !== "VALID") && status==="VALID"){
            await runTestcase(testCase, {runner_image: data.img, image_version: data.img_ver});
        }
        return;
    }
    // not a validation job, update the score in db
    await updateScore(submission, testCase, pass);
});
